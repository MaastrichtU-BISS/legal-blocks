// Datasets: the documents everything else is made from.

import type { Handle } from "../db.js";
import { transaction } from "../db.js";
import type { Document } from "../model.js";


/** One row of the datasets tab. */
export interface DatasetSummary {
  id: number;
  /** Who made it, and so who edits it. */
  user_id: number;
  name: string;
  desc: string;
  documents: number;
  task_count: number;
}

/** Every dataset, newest first. */
export function datasets(db: Handle): DatasetSummary[] {
  return db
    .prepare(
      `SELECT ds.id, ds.user_id, ds.name, ds."desc",
              (SELECT COUNT(*) FROM documents doc WHERE doc.dataset_id = ds.id) AS documents,
              (SELECT COUNT(*) FROM tasks t WHERE t.dataset_id = ds.id) AS task_count
       FROM datasets ds ORDER BY ds.id DESC`,
    )
    .all() as DatasetSummary[];
}

/**
 * A document on its way in: no id yet, and a source that defaults to its name.
 * `metadata` is whatever the producing step attached, such as the other
 * columns of a CSV row; it is stored as JSON and read back verbatim.
 */
export type NewDocument = Pick<Document, "name" | "full_text"> & {
  source?: string;
  metadata?: Record<string, unknown> | null;
};

/** A stored document with what its producing step attached. */
export interface DocumentRow {
  name: string;
  full_text: string;
  metadata: Record<string, unknown> | null;
}

/** Every document in a dataset with its metadata, in the order it was added. */
export function datasetRows(db: Handle, datasetId: number): DocumentRow[] {
  const rows = db
    .prepare(`SELECT name, full_text, metadata FROM documents WHERE dataset_id = ? ORDER BY id`)
    .all(datasetId) as { name: string; full_text: string; metadata: string | null }[];
  return rows.map((r) => ({ ...r, metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : null }));
}

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
    `INSERT INTO documents (dataset_id, name, source, full_text, metadata)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (dataset_id, name) DO UPDATE SET
       full_text = excluded.full_text, metadata = excluded.metadata`,
  );
  for (const doc of docs) {
    const name = doc.name.trim();
    if (name === "") continue;
    insert.run(
      datasetId,
      name,
      doc.source || name,
      doc.full_text,
      doc.metadata ? JSON.stringify(doc.metadata) : null,
    );
  }
}
