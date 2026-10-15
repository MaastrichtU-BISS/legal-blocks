import { taskAnnotators } from "@legal-blocks/db";

export default defineEventHandler((event) => {
  requireTaskEditor(event, idParam(event, "id"));
  return taskAnnotators(requireDb(event), idParam(event, "id"));
});
