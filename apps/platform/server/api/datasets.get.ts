import { datasets } from "@legal-blocks/db";

export default defineEventHandler((event) => {
  requireRole(event, "editor");
  return datasets(requireDb(event));
});
