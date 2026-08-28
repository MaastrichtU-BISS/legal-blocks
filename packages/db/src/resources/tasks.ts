// Tasks: a dataset and a labelset, handed to some people.

import type { Handle } from "../db.js";
import { transaction } from "../db.js";
import type { User } from "../model.js";
import { usersByEmail } from "../users.js";


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
 * How far along one annotator, or one document, is.
 *
 * Two counts because there are two questions, and one number cannot answer
 * both. `done` is assignments with anything on them at all — what has been
 * picked up. `finished` is assignments somebody marked done — what can be
 * measured. A document three annotators have opened and none has finished is
 * 3 done, 0 finished, and reporting either alone hides half of that.
 */
export interface ProgressRow {
  id: number;
  name: string;
  done: number;
  finished: number;
  total: number;
}

/**
 * A task's progress, cut three ways.
 *
 * Whoever set the task up needs to know where it stands before agreement
 * figures mean anything: two annotators can agree perfectly on the four
 * documents they have both finished while a third has not started. The
 * per-annotator cut says who to chase; the per-document cut says which
 * documents are ready to measure.
 */
export interface TaskProgress {
  done: number;
  finished: number;
  total: number;
  byAnnotator: ProgressRow[];
  byDocument: ProgressRow[];
}

/**
 * Counts assignments touched against assignments in total, per annotator and
 * per document.
 *
 * "Touched" is the same definition the task list uses — an assignment with any
 * annotation on it, of either kind. It deliberately does not mean "finished":
 * nothing in the schema records that somebody considers a document done, and
 * inventing a threshold here would put a number on the screen that no other
 * count agrees with.
 */
export function taskProgress(db: Handle, taskId: number): TaskProgress {
  // One CTE so the three cuts cannot drift apart. Written once, grouped twice.
  const touched = `
    SELECT a.id, a.user_id, a.document_id,
           CASE WHEN EXISTS (SELECT 1 FROM span_annotations s WHERE s.assignment_id = a.id)
                  OR EXISTS (SELECT 1 FROM document_annotations d WHERE d.assignment_id = a.id)
                THEN 1 ELSE 0 END AS done,
           CASE WHEN a.status = 'done' THEN 1 ELSE 0 END AS finished
      FROM assignments a
     WHERE a.task_id = ?`;

  const byAnnotator = db
    .prepare(
      `WITH t AS (${touched})
       SELECT u.id AS id,
              COALESCE(NULLIF(u.email, ''), u.name) AS name,
              SUM(t.done) AS done,
              SUM(t.finished) AS finished,
              COUNT(*) AS total
         FROM t JOIN users u ON u.id = t.user_id
        GROUP BY u.id
        ORDER BY name`,
    )
    .all(taskId) as ProgressRow[];

  const byDocument = db
    .prepare(
      `WITH t AS (${touched})
       SELECT d.id AS id, d.name AS name,
              SUM(t.done) AS done, SUM(t.finished) AS finished, COUNT(*) AS total
         FROM t JOIN documents d ON d.id = t.document_id
        GROUP BY d.id
        ORDER BY d.name`,
    )
    .all(taskId) as ProgressRow[];

  const total = byAnnotator.reduce((n, r) => n + r.total, 0);
  const done = byAnnotator.reduce((n, r) => n + r.done, 0);
  const finished = byAnnotator.reduce((n, r) => n + r.finished, 0);
  return { done, finished, total, byAnnotator, byDocument };
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
