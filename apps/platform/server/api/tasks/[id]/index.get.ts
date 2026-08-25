import { NotFoundError, task } from "@legal-blocks/db";

/** One task with its labelset resolved. */
export default defineEventHandler((event) => {
  const id = idParam(event, "id");
  try {
    return task(requireDb(event), id);
  } catch (e) {
    if (e instanceof NotFoundError) throw fail(event, 404, `no task ${id}`);
    throw e;
  }
});
