// The agreement module's data access.
//
// Filtering is a query rather than an array filter in the browser: the package
// asks for "annotations matching these filters" and gets exactly those rows
// back, instead of the whole task being loaded so it can be narrowed
// client-side.

import type { Handle } from "./db.js";
import type {
  AnnotationFilters,
  Document,
  IaaAnnotation,
  IaaInput,
  RichAnnotation,
} from "./model.js";
import { documentTags, spans } from "./assignments.js";
import { task } from "./tasks.js";

/** One annotator surfaced for the metrics UI. */
export interface TaskAnnotator {
  user_id: number;
  email: string;
}

/** The users with an assignment in a task. */
export function taskAnnotators(db: Handle, taskId: number): TaskAnnotator[] {
  return db
    .prepare(
      `SELECT DISTINCT a.user_id AS user_id,
              COALESCE(NULLIF(u.email, ''), u.name) AS email
       FROM assignments a JOIN users u ON u.id = a.user_id
       WHERE a.task_id = ? ORDER BY email`,
    )
    .all(taskId)
    .map((r) => {
      const row = r as { user_id: number; email: string };
      return { user_id: row.user_id, email: row.email };
    });
}

/** A task's documents in queue order. */
export function taskDocuments(db: Handle, taskId: number): Document[] {
  return db
    .prepare(
      `SELECT DISTINCT d.id, d.name, d.full_text
       FROM documents d JOIN assignments a ON a.document_id = d.id
       WHERE a.task_id = ? ORDER BY d.name`,
    )
    .all(taskId) as Document[];
}

/**
 * A task's annotations, filtered, flattened with the context the metrics
 * module displays.
 *
 * Whole-document labels live in their own table and have no offsets, so they
 * join the list as zero-extent rows — the same encoding iaaInput uses, and the
 * one the metrics card expects: it hides the text and its expander when the
 * task is document-level. Both tables are read unconditionally rather than
 * picking one from the task's level, because syncTask can change that level
 * under work that already exists, and annotations somebody made should not
 * disappear from a list when it does.
 */
export function annotations(
  db: Handle,
  taskId: number,
  filters: AnnotationFilters = {},
): RichAnnotation[] {
  const sql: string[] = [
    `SELECT ann_id, "start", "end", text, label, confidence, metadata,
            user_id, email, doc_name
     FROM (
       SELECT s.id AS ann_id, s."start" AS "start", s."end" AS "end",
              s.text AS text, s.label AS label, s.confidence AS confidence,
              s.metadata AS metadata, a.task_id AS task_id,
              a.user_id AS user_id, u.email AS email, u.name AS name, d.name AS doc_name
       FROM span_annotations s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN users u ON u.id = a.user_id
       JOIN documents d ON d.id = a.document_id
       UNION ALL
       SELECT t.id, 0, 0, '', t.label, t.confidence, NULL, a.task_id,
              a.user_id, u.email, u.name, d.name
       FROM document_annotations t
       JOIN assignments a ON a.id = t.assignment_id
       JOIN users u ON u.id = a.user_id
       JOIN documents d ON d.id = a.document_id
     )
     WHERE task_id = ?`,
  ];
  const args: unknown[] = [taskId];

  const appendIn = (column: string, values: string[] | undefined): void => {
    if (!values || values.length === 0) return;
    sql.push(` AND ${column} IN (${values.map(() => "?").join(", ")})`);
    args.push(...values);
  };
  appendIn("label", filters.labels);
  appendIn("doc_name", filters.documents);
  appendIn("COALESCE(NULLIF(email, ''), name)", filters.annotators);
  sql.push(` ORDER BY doc_name, "start", ann_id`);

  const rows = db.prepare(sql.join("")).all(...args) as {
    ann_id: number;
    start: number;
    end: number;
    text: string;
    label: string;
    confidence: number;
    metadata: string | null;
    user_id: number;
    email: string | null;
    name: string;
    doc_name: string;
  }[];

  return rows.map((r) => ({
    ann_id: r.ann_id,
    start: r.start,
    end: r.end,
    text: r.text,
    label: r.label,
    confidence: r.confidence,
    metadata: r.metadata,
    annotator: r.email && r.email !== "" ? r.email : r.name,
    doc_id: r.doc_name,
    doc_name: r.doc_name,
  }));
}

/**
 * The whole task in the shape the IAA service expects.
 *
 * Document-level tasks contribute their document annotations as zero-extent
 * spans, which is the encoding the service already understands: it compares
 * label presence per document and ignores the offsets.
 */
export function iaaInput(db: Handle, taskId: number): IaaInput {
  const t = task(db, taskId);
  const input: IaaInput = {
    labelset: { labels: t.labelset.labels.map((l) => ({ name: l.name })) },
    documents: [],
  };
  if (t.annotation_level === "document") input.annotation_level = "document";

  const assignmentsOf = db.prepare(
    `SELECT a.id, a.user_id, a.confidence, u.email AS email, u.name AS name
     FROM assignments a JOIN users u ON u.id = a.user_id
     WHERE a.task_id = ? AND a.document_id = ? ORDER BY a.user_id`,
  );

  for (const doc of taskDocuments(db, taskId)) {
    const rows = assignmentsOf.all(taskId, doc.id) as {
      id: number;
      user_id: number;
      confidence: number;
      email: string | null;
      name: string;
    }[];

    input.documents.push({
      name: doc.name,
      full_text: doc.full_text,
      assignments: rows.map((a) => ({
        annotator: a.email && a.email !== "" ? a.email : a.name,
        difficulty_rating: a.confidence,
        annotations:
          t.annotation_level === "document"
            ? documentTags(db, a.id).map(
                (tag): IaaAnnotation => ({ start: 0, end: 0, label: tag.label, text: "" }),
              )
            : spans(db, a.id).map(
                (s): IaaAnnotation => ({
                  start: s.start,
                  end: s.end,
                  label: s.label,
                  text: s.text,
                }),
              ),
      })),
    });
  }

  return input;
}
