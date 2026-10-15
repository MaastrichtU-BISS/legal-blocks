// What somebody may reach. Nobody is an editor or an annotator in general:
// you edit what you made, and you annotate where you were given documents.
// Being the platform's admin gives no access to anybody else's work.

import type { H3Event } from "h3";
import { assignmentLocked, assignmentOwners, datasets, tasks, type Account } from "@legal-blocks/db";

export function canEdit(me: Account, ownerId: number): boolean {
  return me.id === ownerId;
}

function findTask(event: H3Event, taskId: number) {
  const task = tasks(requireDb(event)).find((t) => t.id === taskId);
  if (!task) throw fail(event, 404, `no task ${taskId}`);
  return task;
}

/** Whoever made the task: everybody's progress, agreement, the export. */
export function requireTaskEditor(event: H3Event, taskId: number): void {
  if (!canEdit(currentUser(event), findTask(event, taskId).user_id)) {
    throw fail(event, 403, "only whoever created this task can see this");
  }
}

/** Whoever made the task, or somebody with documents in it. */
export function requireTaskAccess(event: H3Event, taskId: number): void {
  const me = currentUser(event);
  const task = findTask(event, taskId);
  if (canEdit(me, task.user_id) || task.annotators.some((a) => a.id === me.id)) return;
  throw fail(event, 403, "you have no documents in this task");
}

/**
 * The annotator it belongs to, once every earlier document in their queue is
 * done — a queue is worked in order — or whoever made its task.
 */
export function requireAssignmentAccess(event: H3Event, assignmentId: number): void {
  const me = currentUser(event);
  const db = requireDb(event);
  const owners = assignmentOwners(db, assignmentId);
  if (!owners) return;
  if (owners.annotator === me.id) {
    if (assignmentLocked(db, assignmentId)) {
      throw fail(event, 403, "finish the documents before this one first");
    }
    return;
  }
  if (canEdit(me, owners.editor)) return;
  throw fail(event, 403, "this document is somebody else's to annotate");
}

export function requireDatasetEditor(event: H3Event, datasetId: number): void {
  const dataset = datasets(requireDb(event)).find((d) => d.id === datasetId);
  if (!dataset) throw fail(event, 404, `no dataset ${datasetId}`);
  if (!canEdit(currentUser(event), dataset.user_id)) {
    throw fail(event, 403, "only whoever added these documents can see them");
  }
}
