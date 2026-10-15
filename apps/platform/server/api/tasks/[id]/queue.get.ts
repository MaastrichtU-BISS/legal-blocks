import { queue } from "@legal-blocks/db";
import { roleAtLeast } from "@legal-blocks/manifest";

/** One annotator's queue for this task, in order. */
export default defineEventHandler((event) => {
  const userId = Number(getQuery(event)["user_id"]);
  if (!Number.isInteger(userId) || userId <= 0) throw fail(event, 400, "user_id is required");
  const me = currentUser(event);
  if (userId !== me.id && !roleAtLeast(me.role, "editor")) {
    throw fail(event, 403, "you can only see your own queue");
  }
  return queue(requireDb(event), idParam(event, "id"), userId);
});
