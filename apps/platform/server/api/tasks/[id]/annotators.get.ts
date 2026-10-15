import { taskAnnotators } from "@legal-blocks/db";

export default defineEventHandler((event) => {
  requireRole(event, "editor");
  return taskAnnotators(requireDb(event), idParam(event, "id"));
});
