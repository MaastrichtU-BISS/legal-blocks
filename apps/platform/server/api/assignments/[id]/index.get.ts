import { bundle, NotFoundError } from "@legal-blocks/db";

/** One queue position: the document and everything on it. */
export default defineEventHandler((event) => {
  const id = idParam(event, "id");
  try {
    return bundle(requireDb(event), id);
  } catch (e) {
    if (e instanceof NotFoundError) throw fail(event, 404, `no assignment ${id}`);
    throw e;
  }
});
