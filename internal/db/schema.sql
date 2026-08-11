-- The platform's shared database.
--
-- Every module reads and writes here rather than being handed data by the step
-- before it. A pipeline then says which modules are present and what may
-- connect to what; it does not carry payloads.
--
--   users
--     ├── labelsets
--     ├── datasets ──── documents
--     ├── tasks ────────────┐
--     └── assignments ──────┴──── annotations ──── relations
--
-- Column names follow the packages rather than Lawnotation wherever the two
-- disagree, because the packages are what an exported platform actually runs:
-- confidence not difficulty_rating, "order" not seq_pos, "start"/"end" not
-- start_index/end_index, 'character' not 'symbol'. "order", "end", "start" and
-- "desc" are SQL keywords and are quoted throughout. That is the price of a
-- column meaning exactly what the field it stores means, and it is worth
-- paying: every name that shifts in transit is a place for a mapping bug.

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

-- A named set of labels. Kept as a JSON array of {name, color} the way the
-- packages hand it over, rather than a labels table: a labelset is edited and
-- read whole, and nothing joins to an individual label — annotations store the
-- label's name as text, exactly as the packages do.
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
-- annotation
-- ---------------------------------------------------------------------------

CREATE TABLE tasks (
    id               INTEGER PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- ADDED, not in the given spec: a task is unusable without knowing which
    -- labels it offers, and legal-annotation-kit takes a labelset as a
    -- required prop. Lawnotation carries the same column.
    labelset_id      INTEGER REFERENCES labelsets (id) ON DELETE SET NULL,
    name             TEXT NOT NULL DEFAULT '',
    "desc"           TEXT NOT NULL DEFAULT '',
    ann_guidelines   TEXT NOT NULL DEFAULT '',
    -- The level this task asks for. Annotations record their own level too,
    -- so a task whose level changes does not silently reinterpret work already
    -- done at the old one.
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

-- A labelled annotation, span-level or whole-document.
--
-- Document-level tags are annotations with level = 'document': text is empty
-- and "start"/"end" are both 0. One table rather than two means the metrics
-- module reads agreement the same way at either level, and a task that changes
-- level does not need its history moved between tables.
--
-- "start" and "end" are character offsets into the document's full_text,
-- 0-indexed and half-open, matching the packages exactly.
CREATE TABLE annotations (
    id            INTEGER PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
    label         TEXT NOT NULL,
    level         TEXT NOT NULL DEFAULT 'word'
        CHECK (level IN ('character', 'word', 'sentence', 'paragraph', 'document')),
    "start"       INTEGER NOT NULL DEFAULT 0,
    "end"         INTEGER NOT NULL DEFAULT 0,
    text          TEXT NOT NULL DEFAULT '',
    -- Per-annotation confidence, 0-5 stars. Lawnotation has no equivalent;
    -- legal-annotation-kit does, so it is stored.
    confidence    INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 5),
    metadata      TEXT,
    origin        TEXT NOT NULL DEFAULT 'manual'
        CHECK (origin IN ('manual', 'imported', 'model')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ("end" >= "start"),
    -- A document-level tag has no extent; a span-level one must not be empty
    -- of both text and extent. Cheap to state, and it stops the two kinds
    -- being confused by a module that forgets to set the level.
    CHECK (level <> 'document' OR ("start" = 0 AND "end" = 0 AND text = ''))
);

-- A directed link between two annotations. The packages nest these inside the
-- annotation that owns them; as rows, "everything pointing at this one"
-- becomes a query rather than a scan of every annotation in the task.
CREATE TABLE relations (
    id                 INTEGER PRIMARY KEY,
    from_annotation_id INTEGER NOT NULL REFERENCES annotations (id) ON DELETE CASCADE,
    to_annotation_id   INTEGER NOT NULL REFERENCES annotations (id) ON DELETE CASCADE,
    direction          TEXT NOT NULL DEFAULT 'bi'
        CHECK (direction IN ('bi', 'left', 'right')),
    -- JSON array of relation labels ("Is a", "Part of", ...). Free-standing
    -- strings with no identity of their own; a join table would be ceremony.
    labels             TEXT NOT NULL DEFAULT '[]',
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (from_annotation_id <> to_annotation_id)
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
CREATE INDEX idx_annotations_assignment ON annotations (assignment_id);
CREATE INDEX idx_annotations_label ON annotations (label);
CREATE INDEX idx_documents_dataset ON documents (dataset_id);
CREATE INDEX idx_relations_from ON relations (from_annotation_id);
CREATE INDEX idx_relations_to ON relations (to_annotation_id);
