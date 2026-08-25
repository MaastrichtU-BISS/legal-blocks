// The three things a running platform lets people make: labelsets, datasets,
// and the tasks that join them.
//
// Everything here is created by whoever is using the exported platform rather
// than by whoever assembled it. That is the difference between a platform and
// an appliance, and it is why these are ordinary rows with ordinary lists
// rather than something derived from the pipeline: the pipeline says the
// platform can run annotation tasks, and the people using it decide which.
//
// Labelsets and datasets stand alone deliberately. Making a labelset part of
// task creation would mean retyping the same labels for the second task, and
// the same documents can carry two tasks that label them differently — which
// is the case worth supporting, since comparing those is the point of a lot of
// annotation work.

import type { Handle } from "./db.js";
import { transaction } from "./db.js";
import type { Document, Label, User } from "./model.js";
import { usersByEmail } from "./users.js";

const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
] as const;

// --- labelsets ---------------------------------------------------------------

/** One row of the labelsets tab. */
export interface LabelsetSummary {
  id: number;
  name: string;
  desc: string;
  labels: Label[];
  /** Tasks using it, so deleting one can say what it would take with it. */
  task_count: number;
}

/** Every labelset, newest first. */
export function labelsets(db: Handle): LabelsetSummary[] {
  const rows = db
    .prepare(
      `SELECT l.id, l.name, l."desc", l.labels,
              (SELECT COUNT(*) FROM tasks t WHERE t.labelset_id = l.id) AS task_count
       FROM labelsets l ORDER BY l.id DESC`,
    )
    .all() as { id: number; name: string; desc: string; labels: string; task_count: number }[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    desc: r.desc,
    labels: parseJSON<Label[]>(r.labels, []),
    task_count: r.task_count,
  }));
}

/**
 * Stores a new labelset and returns its id.
 *
 * Colours are assigned here when the caller did not choose them, so every
 * labelset looks deliberate without anyone having to pick from a colour wheel
 * to get started.
 */
export function createLabelset(
  db: Handle,
  ownerId: number,
  name: string,
  desc: string,
  labels: Label[],
): number {
  const filled: Label[] = [];
  labels.forEach((l, i) => {
    const trimmed = l.name.trim();
    if (trimmed === "") return;
    filled.push({ name: trimmed, color: l.color || PALETTE[i % PALETTE.length]! });
  });
  if (filled.length === 0) {
    throw new Error("a labelset needs at least one label");
  }

  return transaction(db, () => {
    const res = db
      .prepare(`INSERT INTO labelsets (user_id, name, "desc", labels) VALUES (?, ?, ?, ?)`)
      .run(ownerId, name.trim(), desc, JSON.stringify(filled));
    return Number(res.lastInsertRowid);
  });
}

// --- datasets ----------------------------------------------------------------

/** One row of the datasets tab. */
export interface DatasetSummary {
  id: number;
  name: string;
  desc: string;
  documents: number;
  task_count: number;
}

/** Every dataset, newest first. */
export function datasets(db: Handle): DatasetSummary[] {
  return db
    .prepare(
      `SELECT ds.id, ds.name, ds."desc",
              (SELECT COUNT(*) FROM documents doc WHERE doc.dataset_id = ds.id) AS documents,
              (SELECT COUNT(*) FROM tasks t WHERE t.dataset_id = ds.id) AS task_count
       FROM datasets ds ORDER BY ds.id DESC`,
    )
    .all() as DatasetSummary[];
}

/** A document on its way in: no id yet, and a source that defaults to its name. */
export type NewDocument = Pick<Document, "name" | "full_text"> & { source?: string };

/** Stores a new dataset with its documents and returns its id. */
export function createDataset(
  db: Handle,
  ownerId: number,
  name: string,
  desc: string,
  docs: NewDocument[],
): number {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("a dataset needs a name");

  return transaction(db, () => {
    const res = db
      .prepare(`INSERT INTO datasets (user_id, name, "desc") VALUES (?, ?, ?)`)
      .run(ownerId, trimmed, desc);
    const id = Number(res.lastInsertRowid);
    insertDocuments(db, id, docs);
    return id;
  });
}

/**
 * Appends documents to an existing dataset.
 *
 * A document already in the dataset keeps its id and its text is refreshed:
 * re-importing a folder must not destroy annotations on the files that were
 * already there.
 */
export function addDocuments(db: Handle, datasetId: number, docs: NewDocument[]): void {
  transaction(db, () => insertDocuments(db, datasetId, docs));
}

function insertDocuments(db: Handle, datasetId: number, docs: NewDocument[]): void {
  const insert = db.prepare(
    `INSERT INTO documents (dataset_id, name, source, full_text)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (dataset_id, name) DO UPDATE SET full_text = excluded.full_text`,
  );
  for (const doc of docs) {
    const name = doc.name.trim();
    if (name === "") continue;
    insert.run(datasetId, name, doc.source || name, doc.full_text);
  }
}

// --- tasks -------------------------------------------------------------------

/** What somebody fills in on the "new task" form. */
export interface TaskSpec {
  name: string;
  desc?: string;
  dataset_id: number;
  labelset_id: number;
  annotation_level?: string;
  ann_guidelines?: string;
  /**
   * Email addresses. They need not belong to anyone who has used this platform
   * before — see usersByEmail.
   */
  annotators: string[];
}

/** One row of the tasks tab. */
export interface TaskSummary {
  id: number;
  name: string;
  desc: string;
  annotation_level: string;
  dataset_id: number;
  dataset_name: string;
  labelset_id: number;
  labelset_name: string;
  annotators: User[];
  documents: number;
  /** Assignments touched at all, over assignments in total. */
  done: number;
  total: number;
}

/** Every task with enough detail to show a row, newest first. */
export function tasks(db: Handle): TaskSummary[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.name, t."desc", t.annotation_level,
              COALESCE(t.dataset_id, 0) AS dataset_id, COALESCE(ds.name, '') AS dataset_name,
              COALESCE(t.labelset_id, 0) AS labelset_id, COALESCE(l.name, '') AS labelset_name,
              (SELECT COUNT(DISTINCT a.document_id) FROM assignments a WHERE a.task_id = t.id) AS documents,
              (SELECT COUNT(*) FROM assignments a WHERE a.task_id = t.id) AS total,
              (SELECT COUNT(*) FROM assignments a
                 WHERE a.task_id = t.id
                   AND (EXISTS (SELECT 1 FROM span_annotations s WHERE s.assignment_id = a.id)
                     OR EXISTS (SELECT 1 FROM document_annotations da WHERE da.assignment_id = a.id))) AS done
       FROM tasks t
       LEFT JOIN datasets ds ON ds.id = t.dataset_id
       LEFT JOIN labelsets l ON l.id = t.labelset_id
       ORDER BY t.id DESC`,
    )
    .all() as Omit<TaskSummary, "annotators">[];

  // Annotators per task, in one pass rather than a query each.
  const people = db
    .prepare(
      `SELECT DISTINCT a.task_id, u.id, u.name, COALESCE(u.email, '') AS email, u.role
       FROM assignments a JOIN users u ON u.id = a.user_id
       ORDER BY a.task_id, u.id`,
    )
    .all() as (User & { task_id: number })[];

  const byTask = new Map<number, User[]>();
  for (const p of people) {
    const list = byTask.get(p.task_id) ?? [];
    list.push({ id: p.id, name: p.name, email: p.email, role: p.role });
    byTask.set(p.task_id, list);
  }

  return rows.map((r) => ({ ...r, annotators: byTask.get(r.id) ?? [] }));
}

/**
 * Makes a task over a dataset with a labelset, and gives every named annotator
 * every document in the dataset.
 *
 * Every annotator sees every document, which is the simplest scheme that still
 * produces the overlap agreement metrics need. Anything more selective —
 * splitting a corpus between people, overlapping only a sample — is a
 * scheduling decision that deserves its own screen rather than a hidden rule.
 */
export function createTask(db: Handle, ownerId: number, spec: TaskSpec): number {
  if (!spec.dataset_id) throw new Error("a task needs a dataset");
  if (!spec.labelset_id) throw new Error("a task needs a labelset");

  const annotators = usersByEmail(db, spec.annotators);
  if (annotators.length === 0) {
    throw new Error("a task needs at least one annotator's email address");
  }

  const level = spec.annotation_level || "word";

  return transaction(db, () => {
    const res = db
      .prepare(
        `INSERT INTO tasks (user_id, dataset_id, labelset_id, name, "desc", ann_guidelines, annotation_level)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ownerId,
        spec.dataset_id,
        spec.labelset_id,
        spec.name.trim(),
        spec.desc ?? "",
        spec.ann_guidelines ?? "",
        level,
      );
    const taskId = Number(res.lastInsertRowid);

    const docIds = db
      .prepare(`SELECT id FROM documents WHERE dataset_id = ? ORDER BY name`)
      .all(spec.dataset_id)
      .map((r) => (r as { id: number }).id);
    if (docIds.length === 0) throw new Error("that dataset has no documents yet");

    const assign = db.prepare(
      `INSERT INTO assignments (user_id, document_id, task_id, "order") VALUES (?, ?, ?, ?)`,
    );
    for (const u of annotators) {
      docIds.forEach((docId, i) => assign.run(u.id, docId, taskId, i + 1));
    }

    return taskId;
  });
}

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
