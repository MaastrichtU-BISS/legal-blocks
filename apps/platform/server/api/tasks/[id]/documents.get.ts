import { taskDocuments } from "@legal-blocks/db";

/**
 * Names only: the metrics module lists documents to filter by and has no use
 * for their text, which can be megabytes.
 */
export default defineEventHandler((event) =>
  taskDocuments(requireDb(event), idParam(event, "id")).map((d) => ({
    value: d.name,
    label: d.name,
  })),
);
