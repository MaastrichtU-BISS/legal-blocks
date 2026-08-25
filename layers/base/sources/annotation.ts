// AnnotationSource — the data-access contract legal-annotation-kit asks its
// host to implement.
//
// Every method is now a request that lands in the platform's database. The
// package asks for "the assignment at this queue position" and says "save this
// assignment", and each of those is one row's worth of work rather than a
// whole task rewritten. That is what lets two annotators work at once: saving
// one assignment cannot touch another's.

import type {
  AnnotationSource,
  AssignmentBundle,
  DocumentRef,
  IncomingRelation,
} from "legal-annotation-kit";
import type { Assignment } from "legal-annotation-kit";
import {
  getBundle,
  getIncomingRelations,
  getQueue,
  saveAssignment,
  type QueueEntry,
} from "../api";

/**
 * Builds a source over one user's queue for a task.
 *
 * The queue is fetched once so `total` can be a plain number, which is what
 * the package's interface asks for. Everything else is loaded on demand.
 */
export async function createAnnotationSource(
  taskId: number,
  userId: number,
): Promise<AnnotationSource> {
  const queue: QueueEntry[] = await getQueue(taskId, userId);

  const at = (position: number): QueueEntry => {
    const entry = queue[position - 1];
    if (!entry) throw new Error(`no document at position ${position}`);
    return entry;
  };

  // Which assignment a given queue position maps to, so save() can address the
  // right row without the package having to know row ids exist.
  const assignmentFor = (assignment: Assignment): QueueEntry => {
    const entry = queue.find((e) => e.order === assignment.order);
    if (!entry) throw new Error("saving an assignment that is not in this queue");
    return entry;
  };

  return {
    total: queue.length,

    async load(position: number): Promise<AssignmentBundle> {
      return (await getBundle(at(position).assignment_id)) as AssignmentBundle;
    },

    async save(assignment: Assignment): Promise<void> {
      const entry = assignmentFor(assignment);
      await saveAssignment(entry.assignment_id, assignment);
      entry.status = assignment.status;
    },

    listDocuments(): DocumentRef[] {
      return queue.map((e) => ({ name: e.name, order: e.order }));
    },

    async listIncomingRelations(toName: string): Promise<IncomingRelation[]> {
      const entry = queue.find((e) => e.name === toName);
      if (!entry) return [];
      // The stored form links two assignments; the host resolves that back to
      // "which document does the relation come from", which is what the
      // package displays.
      const incoming = (await getIncomingRelations(entry.assignment_id)) as {
        to: string;
        labels: string[];
      }[];
      return incoming.map((r) => ({ from: r.to, labels: r.labels }));
    },
  };
}
