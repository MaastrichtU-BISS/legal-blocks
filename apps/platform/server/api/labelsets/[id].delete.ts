import { removeLabelset } from "@legal-blocks/db";

/** Deletes one of this person's labelsets, unless a task is using it. */
export default defineEventHandler((event) => {
  const id = idParam(event, "id");
  requireLabelsetEditor(event, id);
  try {
    removeLabelset(requireDb(event), id);
  } catch (e) {
    throw fail(event, 409, e instanceof Error ? e.message : String(e));
  }
  return { removed: id };
});
