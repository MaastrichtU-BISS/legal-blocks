import { NotFoundError, saveAssignment, type Assignment } from "@legal-blocks/db";

/**
 * Replaces this assignment's annotations with those given.
 *
 * 204 with no body: the annotation kit saves as the user works and has nothing
 * to do with a response, and the alternative — echoing the assignment back —
 * would send every span over the wire twice per save.
 */
export default defineEventHandler(async (event) => {
  const id = idParam(event, "id");
  const body = await readBody<Assignment>(event);
  try {
    saveAssignment(requireDb(event), id, body);
  } catch (e) {
    if (e instanceof NotFoundError) throw fail(event, 404, `no assignment ${id}`);
    throw e;
  }
  setResponseStatus(event, 204);
  return null;
});
