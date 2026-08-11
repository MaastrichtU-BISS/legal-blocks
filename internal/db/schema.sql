-- The platform's shared database.
--
-- Every module reads and writes here rather than being handed data by the step
-- before it. A pipeline then says which modules are present and what may
-- connect to what; it does not carry payloads.
--
--   users
--     ├── labelsets
--     ├── datasets ──── documents
--     ├── tasks
--     └── assignments ──┬── span_annotations ──── span_relations
--                       ├── document_annotations
--                       └── document_relations (assignment ─> assignment)
--
-- Span-level and document-level work are separate tables rather than one table
-- with a level column. They genuinely differ: a span has an extent and text, a
-- document tag has neither. Their relations differ in what they join — spans to
-- spans, assignments to assignments — because a claim about a whole document is
-- one annotator's reading of it, not a fact about the document itself.
--
-- Column names follow the packages rather than Lawnotation wherever the two
-- disagree, because the packages are what an exported platform actually runs:
-- confidence not difficulty_rating, "order" not seq_pos, "start"/"end" not
-- start_index/end_index, 'character' not 'symbol'. "order", "end", "start" and
-- "desc" are SQL keywords and are quoted throughout. That is the price of a
-- column meaning exactly what the field it stores means, and it is worth
-- paying: every name that shifts in transit is a place for a mapping bug.
--
-- A pipeline holds at most one of each module, so nothing here is scoped to a
-- pipeline step. If that ever stops being true, this is where it shows up
-- first: two annotate steps would have no way to tell their tasks apart.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

-- Everything is owned by a user. Today the runtime's "Working as" selector
-- picks one; external_id is where a real identity attaches when there is a
-- login, without the rest of the schema moving. role is recorded but nothing
-- enforces it yet.
CREATE TABLE users (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    role        TEXT NOT NULL DEFAULT 'annotator'
        CHECK (role IN ('annotator', 'editor', 'admin')),
    external_id TEXT UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (name)
);

-- ---------------------------------------------------------------------------
-- content
-- ---------------------------------------------------------------------------

-- A named set of labels, kept as a JSON array of {name, color} the way the
-- packages hand it over. A labelset is read and edited whole and nothing joins
-- to an individual label — annotations store the label's name as text, exactly
-- as the packages do.
CREATE TABLE labelsets (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       TEXT NOT NULL DEFAULT '',
    "desc"     TEXT NOT NULL DEFAULT '',
    labels     TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A collection of documents. This is what an import produces: the corpus
-- folder becomes one dataset, a search result becomes another. Tasks reach
-- documents through assignments, so a dataset can feed more than one task and
-- a task can draw on more than one dataset.
CREATE TABLE datasets (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       TEXT NOT NULL DEFAULT '',
    "desc"     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, name)
);

CREATE TABLE documents (
    id         INTEGER PRIMARY KEY,
    dataset_id INTEGER NOT NULL REFERENCES datasets (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    -- Where it came from: a filename, an ECLI, a URL.
    source     TEXT NOT NULL DEFAULT '',
    full_text  TEXT NOT NULL DEFAULT '',
    -- The producing module's own record, verbatim, as JSON. A search result
    -- carries citation edges and case metadata that no shared column should
    -- try to model; the module that understands it can read it back.
    metadata   TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (dataset_id, name)
);

-- ---------------------------------------------------------------------------
-- tasks and assignments
-- ---------------------------------------------------------------------------

CREATE TABLE tasks (
    id               INTEGER PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    labelset_id      INTEGER REFERENCES labelsets (id) ON DELETE SET NULL,
    name             TEXT NOT NULL DEFAULT '',
    "desc"           TEXT NOT NULL DEFAULT '',
    ann_guidelines   TEXT NOT NULL DEFAULT '',
    -- Decides which kind of work this task collects: 'document' means whole
    -- document tagging, and those tasks fill document_annotations and leave
    -- span_annotations empty. The others are span granularities.
    annotation_level TEXT NOT NULL DEFAULT 'word'
        CHECK (annotation_level IN ('character', 'word', 'sentence', 'paragraph', 'document')),
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One user's work on one document within one task — the unit the annotation
-- kit loads, saves, and walks through in queue order.
CREATE TABLE assignments (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    document_id INTEGER NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    task_id     INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending',
    -- Position in this user's queue for this task, 1-based.
    "order"     INTEGER NOT NULL DEFAULT 0,
    -- Document-level confidence, 0-5 stars; 0 means unrated. Lawnotation calls
    -- this difficulty_rating, and the IAA service still receives it under that
    -- name — the rename happens at that boundary, not in storage.
    confidence  INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 5),
    origin      TEXT NOT NULL DEFAULT 'manual'
        CHECK (origin IN ('manual', 'imported', 'model')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (task_id, document_id, user_id)
);

-- ---------------------------------------------------------------------------
-- span-level annotation
-- ---------------------------------------------------------------------------

-- A labelled stretch of text. "start" and "end" are character offsets into the
-- document's full_text, 0-indexed and half-open, matching the packages exactly.
CREATE TABLE span_annotations (
    id            INTEGER PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
    label         TEXT NOT NULL,
    "start"       INTEGER NOT NULL,
    "end"         INTEGER NOT NULL,
    text          TEXT NOT NULL DEFAULT '',
    -- Per-annotation confidence, 0-5 stars. Lawnotation has no equivalent;
    -- legal-annotation-kit does, so it is stored.
    confidence    INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 5),
    metadata      TEXT,
    origin        TEXT NOT NULL DEFAULT 'manual'
        CHECK (origin IN ('manual', 'imported', 'model')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ("end" >= "start")
);

-- A directed link between two spans. The packages nest these inside the span
-- that owns them; as rows, "everything pointing at this span" becomes a query
-- rather than a scan of every annotation in the task.
CREATE TABLE span_relations (
    id           INTEGER PRIMARY KEY,
    from_span_id INTEGER NOT NULL REFERENCES span_annotations (id) ON DELETE CASCADE,
    to_span_id   INTEGER NOT NULL REFERENCES span_annotations (id) ON DELETE CASCADE,
    direction    TEXT NOT NULL DEFAULT 'bi'
        CHECK (direction IN ('bi', 'left', 'right')),
    -- JSON array of relation labels ("Is a", "Part of", ...). Free-standing
    -- strings with no identity of their own; a join table would be ceremony.
    labels       TEXT NOT NULL DEFAULT '[]',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (from_span_id <> to_span_id)
);

-- ---------------------------------------------------------------------------
-- document-level annotation
-- ---------------------------------------------------------------------------

-- A label applied to a whole document rather than a stretch of it. No extent
-- and no text, which is why this is its own table.
CREATE TABLE document_annotations (
    id            INTEGER PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
    label         TEXT NOT NULL,
    confidence    INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 5),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    -- One document cannot carry the same tag twice within one assignment.
    UNIQUE (assignment_id, label)
);

-- "the document I am annotating relates to that other document".
--
-- Between two assignments rather than two documents: an assignment is one
-- annotator's reading of one document, so the relation is a claim that reading
-- makes, not a fact about the documents themselves. Two annotators can link
-- the same pair of documents differently, and each keeps their own.
--
-- The annotation kit names its target by document, so the runtime resolves
-- that name to the same annotator's assignment for it within the same task.
-- Nothing here enforces that both sides belong to one task — SQLite cannot
-- express it as a constraint, so it stays the runtime's job.
--
-- Stored only on the side that created it: the reverse view is computed and
-- never written, so every relation exists exactly once and counting them needs
-- no de-duplication. That is also why there is no direction column, unlike
-- span_relations — from and to already carry the only direction there is.
CREATE TABLE document_relations (
    id                 INTEGER PRIMARY KEY,
    from_assignment_id INTEGER NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
    to_assignment_id   INTEGER NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
    labels             TEXT NOT NULL DEFAULT '[]',
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (from_assignment_id, to_assignment_id),
    CHECK (from_assignment_id <> to_assignment_id)
);

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------

-- Two access patterns are nearly all the traffic: the annotation kit loading
-- one user's queue in order, and the metrics module reading every annotation
-- in a task.
CREATE INDEX idx_assignments_queue ON assignments (task_id, user_id, "order");
CREATE INDEX idx_assignments_document ON assignments (document_id);
CREATE INDEX idx_assignments_task ON assignments (task_id);
CREATE INDEX idx_span_annotations_assignment ON span_annotations (assignment_id);
CREATE INDEX idx_span_annotations_label ON span_annotations (label);
CREATE INDEX idx_document_annotations_assignment ON document_annotations (assignment_id);
CREATE INDEX idx_documents_dataset ON documents (dataset_id);
CREATE INDEX idx_span_relations_from ON span_relations (from_span_id);
CREATE INDEX idx_span_relations_to ON span_relations (to_span_id);
CREATE INDEX idx_document_relations_from ON document_relations (from_assignment_id);
CREATE INDEX idx_document_relations_to ON document_relations (to_assignment_id);
