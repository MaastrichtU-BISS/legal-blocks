import { incomingRelations } from "@legal-blocks/db";

/**
 * Other assignments' relations pointing at this one's document — the read-only
 * "linked by" view, computed rather than stored.
 */
export default defineEventHandler((event) => {
  const id = idParam(event, "id");
  requireAssignmentAccess(event, id);
  return incomingRelations(requireDb(event), id);
});
