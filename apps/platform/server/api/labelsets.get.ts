import { labelsets } from "@legal-blocks/db";

export default defineEventHandler((event) => {
  requireRole(event, "editor");
  return labelsets(requireDb(event));
});
