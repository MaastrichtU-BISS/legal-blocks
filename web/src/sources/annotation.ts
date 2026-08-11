// AnnotationSource — the data-access contract legal-annotation-kit asks its
// host to implement.
//
// The package deliberately owns no persistence: it asks for "the assignment at
// this queue position" and says "save this assignment", and the host decides
// what that means. Here it means the platform's store, on disk next to the
// binary. That is the whole reason an annotator can refresh the page and lose
// nothing, and none of it required a change to the package.

import type {
  AnnotationSource,
  AssignmentBundle,
  DocumentRef,
  IncomingRelation,
} from "legal-annotation-kit";
import type { Assignment, TaskData } from "legal-annotation-kit";
import { saveTask } from "./task";

/**
 * Builds a source over one annotator's slice of a task.
 *
 * The task is held in memory and written back whole on every save. At these
 * sizes that is simpler than a per-assignment layout and keeps the stored file
 * readable; it does mean two people annotating the same task from two browsers
 * would overwrite each other, which is a real limitation and the thing to fix
 * first when this stops being a single-user demo.
 */
export function createAnnotationSource(
  nodeId: string,
  task: TaskData,
  annotator: number,
): AnnotationSource {
  // Documents this annotator has an assignment for, in queue order.
  const queue = task.documents
    .map((doc) => ({
      doc,
      assignment: doc.assignments.find((a) => a.annotator === annotator),
    }))
    .filter((entry): entry is { doc: TaskData["documents"][number]; assignment: Assignment } =>
      entry.assignment !== undefined,
    )
    .sort((a, b) => a.assignment.order - b.assignment.order);

  return {
    total: queue.length,

    async load(position: number): Promise<AssignmentBundle> {
      const entry = queue[position - 1];
      if (!entry) throw new Error(`no document at position ${position}`);
      return {
        document: { name: entry.doc.name, full_text: entry.doc.full_text },
        assignment: entry.assignment,
      };
    },

    async save(assignment: Assignment): Promise<void> {
      const entry = queue.find(
        (e) => e.assignment.annotator === assignment.annotator && e.assignment.order === assignment.order,
      );
      if (!entry) throw new Error("saving an assignment that is not in this queue");

      // Replace the assignment inside the task, then persist the task. The
      // in-memory queue points at the same document objects, so the next load
      // sees the update without a round trip.
      const docIndex = task.documents.indexOf(entry.doc);
      const asgnIndex = entry.doc.assignments.indexOf(entry.assignment);
      task.documents[docIndex].assignments[asgnIndex] = assignment;
      entry.assignment = assignment;

      await saveTask(nodeId, task);
    },

    listDocuments(): DocumentRef[] {
      return queue.map((e) => ({ name: e.doc.name, order: e.assignment.order }));
    },

    listIncomingRelations(toName: string): IncomingRelation[] {
      const incoming: IncomingRelation[] = [];
      for (const entry of queue) {
        for (const relation of entry.assignment.document_relations ?? []) {
          if (relation.to === toName) {
            incoming.push({ from: entry.doc.name, labels: relation.labels });
          }
        }
      }
      return incoming;
    },
  };
}
