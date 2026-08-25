import { iaaInput, NotFoundError } from "@legal-blocks/db";

/** The whole task in the shape the agreement service expects. */
export default defineEventHandler((event) => {
  const id = idParam(event, "id");
  try {
    return iaaInput(requireDb(event), id);
  } catch (e) {
    if (e instanceof NotFoundError) throw fail(event, 404, `no task ${id}`);
    throw e;
  }
});
