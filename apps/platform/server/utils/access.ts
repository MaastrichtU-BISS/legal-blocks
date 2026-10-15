// What an annotator may reach: the tasks they were given work in and their own
// assignments. Editors and admins reach everything.

import type { H3Event } from "h3";
import { assignmentAnnotator, queue } from "@legal-blocks/db";
import { roleAtLeast } from "@legal-blocks/manifest";

export function requireTaskAccess(event: H3Event, taskId: number): void {
  const me = currentUser(event);
  if (roleAtLeast(me.role, "editor")) return;
  if (queue(requireDb(event), taskId, me.id).length === 0) {
    throw fail(event, 403, "you have no documents in this task");
  }
}

export function requireAssignmentAccess(event: H3Event, assignmentId: number): void {
  const me = currentUser(event);
  if (roleAtLeast(me.role, "editor")) return;
  const owner = assignmentAnnotator(requireDb(event), assignmentId);
  if (owner !== undefined && owner !== me.id) {
    throw fail(event, 403, "this document is somebody else's to annotate");
  }
}
