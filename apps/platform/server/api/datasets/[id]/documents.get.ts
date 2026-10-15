import { datasetDocuments } from "@legal-blocks/db";

// A dataset's documents, as stored.
export default defineEventHandler((event) => {
  requireRole(event, "editor");
  return datasetDocuments(requireDb(event), idParam(event, "id"));
});
