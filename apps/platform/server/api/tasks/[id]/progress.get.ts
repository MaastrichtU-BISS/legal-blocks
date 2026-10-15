// How far along a task is, per annotator and per document.
//
// Everybody's progress, so editors only. Without a login everyone is the
// platform's own admin account and this passes; the workspace hides it from
// annotators as a matter of what to show rather than of access.

import { taskProgress } from "@legal-blocks/db";

export default defineEventHandler((event) => {
  requireRole(event, "editor");
  return taskProgress(requireDb(event), idParam(event, "id"));
});
