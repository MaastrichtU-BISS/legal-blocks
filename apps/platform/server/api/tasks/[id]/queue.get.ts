import { queue } from "@legal-blocks/db";

/** One annotator's queue for this task, in order. */
export default defineEventHandler((event) => {
  const userId = Number(getQuery(event)["user_id"]);
  if (!Number.isInteger(userId) || userId <= 0) throw fail(event, 400, "user_id is required");
  if (userId !== currentUser(event).id) requireTaskEditor(event, idParam(event, "id"));
  return queue(requireDb(event), idParam(event, "id"), userId);
});
