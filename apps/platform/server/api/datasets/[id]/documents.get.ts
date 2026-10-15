import { datasetDocuments } from "@legal-blocks/db";

// A dataset's documents, as stored.
export default defineEventHandler((event) => {
  const id = idParam(event, "id");
  requireDatasetEditor(event, id);
  return datasetDocuments(requireDb(event), id);
});
