import { removeTask } from "@legal-blocks/db";

/** Deletes a task and the work in it. Only whoever made it may. */
export default defineEventHandler((event) => {
  const id = idParam(event, "id");
  requireTaskEditor(event, id);
  removeTask(requireDb(event), id);
  return { removed: id };
});
