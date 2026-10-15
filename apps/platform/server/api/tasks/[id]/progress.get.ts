// How far along a task is, per annotator and per document.
//
// Everybody's progress, so only for whoever made the task. Without a login
// every request is the platform's own admin account and this passes; the
// workspace hides it from annotators as a matter of what to show.

import { taskProgress } from "@legal-blocks/db";

export default defineEventHandler((event) => {
  requireTaskEditor(event, idParam(event, "id"));
  return taskProgress(requireDb(event), idParam(event, "id"));
});
