-- The platform's shared database.
--
-- Every module reads and writes here rather than being handed data by the step
-- before it. A pipeline is then a statement about which modules are present and
-- what they are allowed to connect to, not a conveyor belt carrying payloads.
--
-- The shape follows Lawnotation, because that is the platform most users of
-- this project are trying to rebuild and its vocabulary — projects, tasks,
-- documents, assignments, annotations, labelsets — is the one they already
-- think in. Where Lawnotation and our packages disagree on a name, the packages
-- win, because they are what the exported platform actually runs:
--
--   Lawnotation                    packages                 here
--   assignments.difficulty_rating  Assignment.confidence    confidence
--   assignments.seq_pos            Assignment.order         "order"
--   annotations.start_index        Annotation.start         "start"
--   annotations.end_index          Annotation.end           "end"
--   annotation_level 'symbol'      "character"              character
--
-- "order", "end", "start" and "desc" are SQL keywords and are quoted
-- everywhere. That is the price of matching the packages, and it is worth
-- paying: every mismatch between a column and the field it stores is a place
-- for a mapping bug to hide.

-- ---------------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------------

-- One row per platform. Lawnotation's projects group work under an owner; here
-- there is a single project per exported platform, created on first run. The
-- table exists so that multi-project and multi-tenant use later is a change of
-- queries rather than a change of shape.
CREATE TABLE projects (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    "desc"     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Who is doing the work. Today the runtime's "Working as" dropdown writes here;
-- external_id is where a real identity (an OIDC subject, a Supabase user id)
-- attaches when there is a login, without the rest of the schema moving.
CREATE TABLE annotators (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    external_id TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (project_id, name)
);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

-- node_id is the pipeline node that produced the row. It is what lets two
-- annotate steps in one pipeline hold separate tasks, and what a downstream
-- module follows along an edge to find the data it should read. It is a step's
-- identity, not a foreign key — pipeline.json owns the nodes.
CREATE TABLE documents (
    id         INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    node_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    -- Where it came from: a corpus filename, an ECLI, a URL.
    source     TEXT NOT NULL DEFAULT '',
    full_text  TEXT NOT NULL DEFAULT '',
    -- The producing module's own record, verbatim, as JSON. A search result
    -- carries citation edges and case metadata that no shared column should
    -- try to model; the module that understands it can read it back.
    metadata   TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (project_id, node_id, name)
);

CREATE TABLE labelsets (
    id         INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name       TEXT NOT NULL DEFAULT '',
    "desc"     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Lawnotation keeps labels as a jsonb blob on the labelset. A table instead:
-- the metrics module needs every label with its colour whether or not anything
-- was annotated with it, and that is a query, not a blob to parse.
CREATE TABLE labels (
    id          INTEGER PRIMARY KEY,
    labelset_id INTEGER NOT NULL REFERENCES labelsets (id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '',
    -- Display order; the packages present labels in a stable sequence.
    "order"     INTEGER NOT NULL DEFAULT 0,
    UNIQUE (labelset_id, name)
);

-- ---------------------------------------------------------------------------
-- Annotation
-- ---------------------------------------------------------------------------

CREATE TABLE tasks (
    id               INTEGER PRIMARY KEY,
    project_id       INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    node_id          TEXT NOT NULL,
    name             TEXT NOT NULL DEFAULT '',
    "desc"           TEXT NOT NULL DEFAULT '',
    labelset_id      INTEGER REFERENCES labelsets (id) ON DELETE SET NULL,
    ann_guidelines   TEXT NOT NULL DEFAULT '',
    -- legal-annotation-kit's AnnotationLevel. 'document' means whole-document
    -- tagging: those tasks carry document_annotations and no spans.
    annotation_level TEXT NOT NULL DEFAULT 'word'
        CHECK (annotation_level IN ('character', 'word', 'sentence', 'paragraph', 'document')),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (project_id, node_id)
);

-- One annotator's work on one document within one task — the unit the
-- annotation kit loads, saves and walks through in queue order.
CREATE TABLE assignments (
    id           INTEGER PRIMARY KEY,
    task_id      INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    document_id  INTEGER NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    annotator_id INTEGER NOT NULL REFERENCES annotators (id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending',
    -- Position in this annotator's queue, 1-based.
    "order"      INTEGER NOT NULL DEFAULT 0,
    -- Document-level confidence, 0-5 stars; 0 means unrated. Lawnotation calls
    -- this difficulty_rating and the IAA service still receives it under that
    -- name — the rename happens at that boundary, not in storage.
    confidence   INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 5),
    origin       TEXT NOT NULL DEFAULT 'manual'
        CHECK (origin IN ('manual', 'imported', 'model')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (task_id, document_id, annotator_id)
);

-- A labelled span. "start" and "end" are character offsets into the document's
-- full_text, 0-indexed and half-open, matching the packages exactly.
CREATE TABLE annotations (
    id            INTEGER PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
    label         TEXT NOT NULL,
    "start"       INTEGER NOT NULL,
    "end"         INTEGER NOT NULL,
    text          TEXT NOT NULL DEFAULT '',
    -- Per-annotation confidence, 0-5 stars. Lawnotation has no equivalent;
    -- the annotation kit does, so it is stored.
    confidence    INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 5),
    metadata      TEXT,
    origin        TEXT NOT NULL DEFAULT 'manual'
        CHECK (origin IN ('manual', 'imported', 'model')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ("end" >= "start")
);

-- A directed link between two spans. The packages nest these inside the
-- annotation that owns them; stored as rows, "everything pointing at this span"
-- becomes a query rather than a scan of every annotation in the task.
CREATE TABLE annotation_relations (
    id                 INTEGER PRIMARY KEY,
    from_annotation_id INTEGER NOT NULL REFERENCES annotations (id) ON DELETE CASCADE,
    to_annotation_id   INTEGER NOT NULL REFERENCES annotations (id) ON DELETE CASCADE,
    direction          TEXT NOT NULL DEFAULT 'bi'
        CHECK (direction IN ('bi', 'left', 'right')),
    -- JSON array of relation labels ("Is a", "Part of", ...). A list of
    -- free-standing strings with no identity of their own; a join table would
    -- be ceremony without a payoff.
    labels             TEXT NOT NULL DEFAULT '[]'
);

-- A tag applied to a whole document rather than a span, used by
-- annotation_level = 'document' tasks. Lawnotation has no equivalent.
CREATE TABLE document_annotations (
    id            INTEGER PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
    label         TEXT NOT NULL,
    confidence    INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 5),
    UNIQUE (assignment_id, label)
);

-- "this document relates to that one", stored only on the document that
-- created it. The annotation kit is explicit that the reverse view is computed,
-- never written, so that every relation exists exactly once and counting them
-- needs no de-duplication.
CREATE TABLE document_relations (
    id             INTEGER PRIMARY KEY,
    assignment_id  INTEGER NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
    to_document_id INTEGER NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    labels         TEXT NOT NULL DEFAULT '[]',
    UNIQUE (assignment_id, to_document_id)
);

-- ---------------------------------------------------------------------------
-- Analysis
-- ---------------------------------------------------------------------------

-- A computed agreement report, kept so a result can be revisited, compared, or
-- read by a later module. criterion and granularity are recorded because a
-- report is meaningless without the question that produced it.
--
-- The report itself is JSON: its shape belongs to lawnotation-iaa, and pinning
-- that into columns would mean migrating this schema every time that tool
-- learns a new metric.
CREATE TABLE metric_runs (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    node_id     TEXT NOT NULL,
    task_id     INTEGER REFERENCES tasks (id) ON DELETE CASCADE,
    criterion   TEXT NOT NULL CHECK (criterion IN ('exact', 'contained')),
    granularity TEXT NOT NULL CHECK (granularity IN ('char', 'word')),
    report      TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Module-private state
-- ---------------------------------------------------------------------------

-- An escape hatch for state that is genuinely one module's business and has no
-- place in the shared model: the composer's draft pipeline, a search form's
-- last query. Forcing these into tables would model them badly; leaving them
-- out would mean a second storage mechanism alongside this one.
--
-- Anything two modules need to agree on belongs in a real table above, not
-- here.
CREATE TABLE node_state (
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    node_id    TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, node_id, key)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- The annotation kit loads one annotator's queue in order; the metrics module
-- reads every annotation in a task. These two access patterns are almost all
-- the traffic.
CREATE INDEX idx_assignments_queue ON assignments (task_id, annotator_id, "order");
CREATE INDEX idx_assignments_document ON assignments (document_id);
CREATE INDEX idx_annotations_assignment ON annotations (assignment_id);
CREATE INDEX idx_annotations_label ON annotations (label);
CREATE INDEX idx_documents_node ON documents (project_id, node_id);
CREATE INDEX idx_document_annotations_assignment ON document_annotations (assignment_id);
CREATE INDEX idx_relations_from ON annotation_relations (from_annotation_id);
CREATE INDEX idx_relations_to ON annotation_relations (to_annotation_id);
CREATE INDEX idx_metric_runs_node ON metric_runs (project_id, node_id, created_at);
