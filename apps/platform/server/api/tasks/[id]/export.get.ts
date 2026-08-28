import { NotFoundError, taskExport } from "@legal-blocks/db";

/**
 * The whole task as a file: what it is, what it was annotated with, and every
 * annotation on it. Lawnotation's export shape — see packages/db/task-export.
 *
 * Separate from iaa-input, which is a subset shaped for the agreement service
 * and has no name, no guidelines and no counts.
 */
export default defineEventHandler((event) => {
  const id = idParam(event, "id");
  try {
    return taskExport(requireDb(event), id);
  } catch (e) {
    if (e instanceof NotFoundError) throw fail(event, 404, `no task ${id}`);
    throw e;
  }
});
