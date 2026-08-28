// A whole task as a file somebody can keep, send on, or read years later.
//
// The shape is Lawnotation's task export, field for field, because that is the
// format this project's data already travels in: the agreement service reads a
// subset of it, lawnotation-parser reads it, and anyone here who has exported a
// task before knows what the keys mean. Inventing a second shape would mean two
// formats to keep in step with the schema and none of that recognition.
//
// It is deliberately not the IAA input. That is a *subset*, built for a service
// that compares labels and needs nothing else — no task name, no guidelines, no
// counts. Downloading it gave you the annotations without the thing they were
// annotations *of*.
//
// Two of Lawnotation's fields have no counterpart here and are written as null
// rather than dropped, so a reader written against Lawnotation finds what it
// expects: ls_id is a Label Studio identifier this platform never had, and
// html_metadata belongs to an import path this platform does not have either.

import type { Handle } from "./db.js";
import { documentTags, spans } from "./assignments.js";
import type { Label } from "./model.js";
import { taskDocuments } from "./metrics.js";
import { task } from "./tasks.js";

export interface ExportAnnotation {
  start: number;
  end: number;
  label: string;
  text: string;
  /** Positions within this assignment's own annotations, not row ids. */
  relations: { to: number; direction: string; labels: string[] }[];
  ls_id: string | null;
  confidence_rating: number;
  html_metadata: unknown;
}

export interface ExportAssignment {
  /**
   * Which annotator, as a number from 1.
   *
   * Not the user id and not their address. An export is the thing that gets
   * sent to a colleague or attached to a paper, and who annotated what is not
   * usually part of the result — Lawnotation numbers them for the same reason.
   * Whoever runs the task can see the names in Progress.
   */
  annotator: number;
  order: number;
  status: string;
  difficulty_rating: number;
  annotations: ExportAnnotation[];
}

export interface ExportDocument {
  name: string;
  full_text: string;
  assignments: ExportAssignment[];
}

export interface TaskExport {
  name: string;
  desc: string;
  labelset: { name: string; desc: string; labels: Label[] };
  ann_guidelines: string;
  annotation_level: string;
  documents: ExportDocument[];
  counts: {
    documents: number;
    assignments: number;
    annotators: number;
    annotations: number;
    relations: number;
  };
}

/**
 * The whole task: what it is, what it was annotated with, and everything on it.
 *
 * Document-level tasks contribute their document tags as zero-extent
 * annotations, the same encoding iaaInput uses — a label on a document is a
 * label with nothing to point at, and giving it invented offsets would be
 * worse than giving it none.
 */
export function taskExport(db: Handle, taskId: number): TaskExport {
  const t = task(db, taskId);
  const documentLevel = t.annotation_level === "document";

  const assignmentsOf = db.prepare(
    `SELECT a.id, a.user_id, a."order", a.status, a.confidence
       FROM assignments a
      WHERE a.task_id = ? AND a.document_id = ?
      ORDER BY a."order", a.user_id`,
  );

  // Annotators are numbered in the order they are first met, so the numbering
  // is stable for a given task rather than following row ids.
  const annotatorNumber = new Map<number, number>();
  const documents: ExportDocument[] = [];

  for (const doc of taskDocuments(db, taskId)) {
    const rows = assignmentsOf.all(taskId, doc.id) as {
      id: number;
      user_id: number;
      order: number;
      status: string;
      confidence: number;
    }[];

    documents.push({
      name: doc.name,
      full_text: doc.full_text,
      assignments: rows.map((a) => {
        if (!annotatorNumber.has(a.user_id)) {
          annotatorNumber.set(a.user_id, annotatorNumber.size + 1);
        }

        return {
          annotator: annotatorNumber.get(a.user_id)!,
          order: a.order,
          status: a.status,
          difficulty_rating: a.confidence,
          annotations: documentLevel
            ? documentTags(db, a.id).map(
                (tag): ExportAnnotation => ({
                  start: 0,
                  end: 0,
                  label: tag.label,
                  text: "",
                  relations: [],
                  ls_id: null,
                  confidence_rating: tag.confidence,
                  html_metadata: null,
                }),
              )
            : annotationsOf(db, a.id),
        };
      }),
    });
  }

  const assignments = documents.reduce((n, d) => n + d.assignments.length, 0);
  const annotations = documents.reduce(
    (n, d) => n + d.assignments.reduce((m, a) => m + a.annotations.length, 0),
    0,
  );
  const relations = documents.reduce(
    (n, d) =>
      n +
      d.assignments.reduce(
        (m, a) => m + a.annotations.reduce((r, ann) => r + ann.relations.length, 0),
        0,
      ),
    0,
  );

  return {
    name: t.name,
    desc: t.desc,
    labelset: t.labelset,
    ann_guidelines: t.ann_guidelines,
    annotation_level: t.annotation_level,
    documents,
    counts: {
      documents: documents.length,
      assignments,
      annotators: annotatorNumber.size,
      annotations,
      relations,
    },
  };
}

/**
 * One assignment's spans, with relations rewritten to positions.
 *
 * Stored relations point at annotation row ids, which mean nothing outside
 * this database — a file that referred to them would be unreadable anywhere
 * else. Positions within the same assignment survive being sent on, and a
 * relation pointing outside it is dropped rather than left dangling.
 */
function annotationsOf(db: Handle, assignmentId: number): ExportAnnotation[] {
  const rows = spans(db, assignmentId);
  const position = new Map<number, number>();
  rows.forEach((s, i) => position.set(s.id, i));

  return rows.map((s) => ({
    start: s.start,
    end: s.end,
    label: s.label,
    text: s.text,
    relations: s.relations
      .filter((r) => position.has(r.to))
      .map((r) => ({ to: position.get(r.to)!, direction: r.direction, labels: r.labels })),
    ls_id: null,
    confidence_rating: s.confidence,
    html_metadata: s.metadata ?? null,
  }));
}
