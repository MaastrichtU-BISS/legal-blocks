// The annotation kit's data access: a queue, one bundle at a time, and a save
// that replaces everything on it.

import type { Handle } from "./db.js";
import { NotFoundError, transaction } from "./db.js";
import type {
  Assignment,
  Bundle,
  DocumentAnnotation,
  DocumentRelation,
  QueueEntry,
  Relation,
  SpanAnnotation,
} from "./model.js";

/** One user's assignments for a task, in queue order. */
export function queue(db: Handle, taskId: number, userId: number): QueueEntry[] {
  return db
    .prepare(
      `SELECT a.id AS assignment_id, d.name, a."order", a.status
       FROM assignments a JOIN documents d ON d.id = a.document_id
       WHERE a.task_id = ? AND a.user_id = ?
       ORDER BY a."order"`,
    )
    .all(taskId, userId) as QueueEntry[];
}

/** One queue position: the document and everything on it. */
export function bundle(db: Handle, assignmentId: number): Bundle {
  const row = db
    .prepare(
      `SELECT d.id AS doc_id, d.name AS doc_name, d.full_text,
              a.id, a.user_id, a."order", a.status, a.confidence
       FROM assignments a JOIN documents d ON d.id = a.document_id
       WHERE a.id = ?`,
    )
    .get(assignmentId) as
    | {
        doc_id: number;
        doc_name: string;
        full_text: string;
        id: number;
        user_id: number;
        order: number;
        status: string;
        confidence: number;
      }
    | undefined;

  if (!row) throw new NotFoundError(`no assignment ${assignmentId}`);

  return {
    document: { id: row.doc_id, name: row.doc_name, full_text: row.full_text },
    assignment: {
      id: row.id,
      annotator: row.user_id,
      order: row.order,
      status: row.status,
      confidence: row.confidence,
      annotations: spans(db, assignmentId),
      document_annotations: documentTags(db, assignmentId),
      document_relations: documentRelations(db, assignmentId),
    },
  };
}

/**
 * One assignment's spans, with their relations nested.
 *
 * Relations are stored as rows but the annotation kit expects them under the
 * span that owns them.
 */
export function spans(db: Handle, assignmentId: number): SpanAnnotation[] {
  const rows = db
    .prepare(
      `SELECT id, label, "start", "end", text, confidence, metadata
       FROM span_annotations WHERE assignment_id = ? ORDER BY "start", id`,
    )
    .all(assignmentId) as Omit<SpanAnnotation, "relations">[];

  const out: SpanAnnotation[] = rows.map((r) => ({ ...r, relations: [] }));
  if (out.length === 0) return out;

  const byId = new Map(out.map((s, i) => [s.id, i]));
  const relRows = db
    .prepare(
      `SELECT r.from_span_id, r.to_span_id, r.direction, r.labels
       FROM span_relations r
       JOIN span_annotations s ON s.id = r.from_span_id
       WHERE s.assignment_id = ?`,
    )
    .all(assignmentId) as {
    from_span_id: number;
    to_span_id: number;
    direction: string;
    labels: string;
  }[];

  for (const r of relRows) {
    const i = byId.get(r.from_span_id);
    if (i === undefined) continue;
    const rel: Relation = { to: r.to_span_id, direction: r.direction, labels: parseLabels(r.labels) };
    out[i]!.relations.push(rel);
  }
  return out;
}

export function documentTags(db: Handle, assignmentId: number): DocumentAnnotation[] {
  return db
    .prepare(
      `SELECT id, label, confidence FROM document_annotations
       WHERE assignment_id = ? ORDER BY id`,
    )
    .all(assignmentId) as DocumentAnnotation[];
}

/**
 * Resolves the stored assignment-to-assignment links back into the "target
 * document name" form the annotation kit works in.
 */
export function documentRelations(db: Handle, assignmentId: number): DocumentRelation[] {
  const rows = db
    .prepare(
      `SELECT d.name, r.labels
       FROM document_relations r
       JOIN assignments a ON a.id = r.to_assignment_id
       JOIN documents d ON d.id = a.document_id
       WHERE r.from_assignment_id = ?`,
    )
    .all(assignmentId) as { name: string; labels: string }[];
  return rows.map((r) => ({ to: r.name, labels: parseLabels(r.labels) }));
}

/**
 * Other assignments' relations pointing at this one's document — the read-only
 * "Linked by" view, computed rather than stored.
 */
export function incomingRelations(db: Handle, assignmentId: number): DocumentRelation[] {
  const rows = db
    .prepare(
      `SELECT d.name, r.labels
       FROM document_relations r
       JOIN assignments fa ON fa.id = r.from_assignment_id
       JOIN documents d ON d.id = fa.document_id
       WHERE r.to_assignment_id = ?`,
    )
    .all(assignmentId) as { name: string; labels: string }[];
  return rows.map((r) => ({ to: r.name, labels: parseLabels(r.labels) }));
}

/**
 * Replaces one assignment's annotations with those given.
 *
 * Delete-then-insert rather than diffing: an assignment holds a handful of
 * spans, the whole thing arrives at once from a component that owns the edit,
 * and a diff would be more code with more ways to be subtly wrong. It runs in
 * one transaction, so a failure leaves the previous state untouched.
 */
export function saveAssignment(
  db: Handle,
  assignmentId: number,
  a: Pick<Assignment, "status" | "confidence" | "annotations" | "document_annotations" | "document_relations">,
): void {
  transaction(db, () => {
    const owner = db
      .prepare(`SELECT task_id, user_id FROM assignments WHERE id = ?`)
      .get(assignmentId) as { task_id: number; user_id: number } | undefined;
    if (!owner) throw new NotFoundError(`no assignment ${assignmentId}`);

    db.prepare(`UPDATE assignments SET status = ?, confidence = ? WHERE id = ?`).run(
      a.status,
      a.confidence,
      assignmentId,
    );

    // Spans and their relations. Relations reference spans by the ids the
    // client saw, so new ids are mapped as rows are inserted.
    db.prepare(`DELETE FROM span_annotations WHERE assignment_id = ?`).run(assignmentId);

    const insertSpan = db.prepare(
      `INSERT INTO span_annotations
         (assignment_id, label, "start", "end", text, confidence, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const newId = new Map<number, number>();
    for (const s of a.annotations ?? []) {
      const res = insertSpan.run(
        assignmentId,
        s.label,
        s.start,
        s.end,
        s.text ?? "",
        s.confidence ?? 0,
        s.metadata ?? null,
      );
      newId.set(s.id, Number(res.lastInsertRowid));
    }

    const insertRel = db.prepare(
      `INSERT INTO span_relations (from_span_id, to_span_id, direction, labels)
       VALUES (?, ?, ?, ?)`,
    );
    for (const s of a.annotations ?? []) {
      const from = newId.get(s.id);
      if (from === undefined) continue;
      for (const rel of s.relations ?? []) {
        const to = newId.get(rel.to);
        // Points at a span that was deleted in this same save.
        if (to === undefined) continue;
        insertRel.run(from, to, rel.direction || "bi", JSON.stringify(rel.labels ?? []));
      }
    }

    db.prepare(`DELETE FROM document_annotations WHERE assignment_id = ?`).run(assignmentId);
    const insertTag = db.prepare(
      `INSERT INTO document_annotations (assignment_id, label, confidence) VALUES (?, ?, ?)`,
    );
    for (const t of a.document_annotations ?? []) {
      insertTag.run(assignmentId, t.label, t.confidence ?? 0);
    }

    // Document relations arrive naming a target document; they are stored as a
    // link to that document's assignment for the same user and task.
    db.prepare(`DELETE FROM document_relations WHERE from_assignment_id = ?`).run(assignmentId);
    const findTarget = db.prepare(
      `SELECT a.id FROM assignments a JOIN documents d ON d.id = a.document_id
       WHERE a.task_id = ? AND a.user_id = ? AND d.name = ?`,
    );
    const insertDocRel = db.prepare(
      `INSERT INTO document_relations (from_assignment_id, to_assignment_id, labels)
       VALUES (?, ?, ?)`,
    );
    for (const rel of a.document_relations ?? []) {
      const target = findTarget.get(owner.task_id, owner.user_id, rel.to) as
        | { id: number }
        | undefined;
      // The named document is not in this user's queue; nothing to point at,
      // so the relation is dropped rather than invented.
      if (!target || target.id === assignmentId) continue;
      insertDocRel.run(assignmentId, target.id, JSON.stringify(rel.labels ?? []));
    }
  });
}

function parseLabels(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}
