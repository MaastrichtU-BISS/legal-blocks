import type { Handle } from "./db.js";
import { NotFoundError, transaction } from "./db.js";
import type { Document, Label, Task, TaskConfig } from "./model.js";

/** Supplies label colours when the settings give only names. */
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

/** A dataset's documents in name order. */
export function datasetDocuments(db: Handle, datasetId: number): Document[] {
  return db
    .prepare(`SELECT id, name, full_text FROM documents WHERE dataset_id = ? ORDER BY name`)
    .all(datasetId) as Document[];
}

/**
 * Creates or updates the task for a dataset and makes sure every user has an
 * assignment for every document, in queue order.
 *
 * Idempotent, and called every time the annotate step is opened, so changing
 * the labels or the number of annotators takes effect without losing anything
 * already annotated. Assignments are only ever added — removing one would
 * delete that annotator's work with it.
 */
export function syncTask(
  db: Handle,
  ownerId: number,
  datasetId: number,
  cfg: TaskConfig,
): number {
  const labels: Label[] = cfg.labels.map((name, i) => ({
    name,
    color: PALETTE[i % PALETTE.length]!,
  }));
  const labelsJSON = JSON.stringify(labels);
  const level = cfg.annotation_level || "word";

  return transaction(db, () => {
    // One task per dataset, since a pipeline holds one annotate step.
    let found = db
      .prepare(
        `SELECT t.id AS taskId, t.labelset_id AS labelsetId FROM tasks t
         JOIN assignments a ON a.task_id = t.id
         JOIN documents doc ON doc.id = a.document_id
         WHERE doc.dataset_id = ? LIMIT 1`,
      )
      .get(datasetId) as { taskId: number; labelsetId: number } | undefined;

    if (!found) {
      // No task yet, or one with no assignments: look for a bare task.
      found = db
        .prepare(
          `SELECT id AS taskId, labelset_id AS labelsetId FROM tasks
           WHERE user_id = ? ORDER BY id LIMIT 1`,
        )
        .get(ownerId) as { taskId: number; labelsetId: number } | undefined;
    }

    let taskId: number;
    if (!found) {
      const labelset = db
        .prepare(`INSERT INTO labelsets (user_id, name, labels) VALUES (?, 'Labels', ?)`)
        .run(ownerId, labelsJSON);
      const task = db
        .prepare(
          `INSERT INTO tasks (user_id, labelset_id, name, ann_guidelines, annotation_level)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(ownerId, labelset.lastInsertRowid, cfg.name, cfg.guidelines, level);
      taskId = Number(task.lastInsertRowid);
    } else {
      taskId = found.taskId;
      db.prepare(
        `UPDATE tasks SET name = ?, ann_guidelines = ?, annotation_level = ? WHERE id = ?`,
      ).run(cfg.name, cfg.guidelines, level, taskId);
      db.prepare(`UPDATE labelsets SET labels = ? WHERE id = ?`).run(labelsJSON, found.labelsetId);
    }

    // Every user gets every document, in the dataset's name order. The
    // simplest scheme that still produces the overlap agreement needs;
    // anything more selective is a scheduling feature and belongs in a module
    // of its own.
    const userIds = db
      .prepare(`SELECT id FROM users ORDER BY id LIMIT ?`)
      .all(Math.max(cfg.annotators, 1))
      .map((r) => (r as { id: number }).id);
    const docIds = db
      .prepare(`SELECT id FROM documents WHERE dataset_id = ? ORDER BY name`)
      .all(datasetId)
      .map((r) => (r as { id: number }).id);

    const assign = db.prepare(
      `INSERT INTO assignments (user_id, document_id, task_id, "order")
       VALUES (?, ?, ?, ?)
       ON CONFLICT (task_id, document_id, user_id) DO UPDATE SET "order" = excluded."order"`,
    );
    for (const uid of userIds) {
      docIds.forEach((did, i) => assign.run(uid, did, taskId, i + 1));
    }

    return taskId;
  });
}

/** A task with its labelset resolved. */
export function task(db: Handle, taskId: number): Task {
  const row = db
    .prepare(
      `SELECT t.id, t.name, t."desc", t.ann_guidelines, t.annotation_level,
              l.name AS ls_name, l."desc" AS ls_desc, l.labels AS ls_labels
       FROM tasks t LEFT JOIN labelsets l ON l.id = t.labelset_id
       WHERE t.id = ?`,
    )
    .get(taskId) as
    | {
        id: number;
        name: string;
        desc: string;
        ann_guidelines: string;
        annotation_level: string;
        ls_name: string | null;
        ls_desc: string | null;
        ls_labels: string | null;
      }
    | undefined;

  if (!row) throw new NotFoundError(`no task ${taskId}`);

  return {
    id: row.id,
    name: row.name,
    desc: row.desc,
    ann_guidelines: row.ann_guidelines,
    annotation_level: row.annotation_level,
    labelset: {
      name: row.ls_name ?? "",
      desc: row.ls_desc ?? "",
      labels: parseLabels(row.ls_labels),
    },
  };
}

function parseLabels(raw: string | null): Label[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Label[]) : [];
  } catch {
    return [];
  }
}
