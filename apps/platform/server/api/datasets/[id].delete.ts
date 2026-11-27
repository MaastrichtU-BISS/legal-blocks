import { removeDataset } from "@legal-blocks/db";

/** Deletes one of this person's datasets, unless a task is using it. */
export default defineEventHandler((event) => {
  const id = idParam(event, "id");
  requireDatasetEditor(event, id);
  try {
    removeDataset(requireDb(event), id);
  } catch (e) {
    throw fail(event, 409, e instanceof Error ? e.message : String(e));
  }
  return { removed: id };
});
