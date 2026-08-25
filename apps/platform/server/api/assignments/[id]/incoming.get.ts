import { incomingRelations } from "@legal-blocks/db";

/**
 * Other assignments' relations pointing at this one's document — the read-only
 * "linked by" view, computed rather than stored.
 */
export default defineEventHandler((event) =>
  incomingRelations(requireDb(event), idParam(event, "id")),
);
