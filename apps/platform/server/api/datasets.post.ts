import { createDataset } from "@legal-blocks/db";

import type { NewDocument } from "@legal-blocks/db";

/** Stores uploaded documents as a new dataset. */
export default defineEventHandler(async (event) => {
  const db = requireDb(event);
  const body = await readBody<{ name?: string; desc?: string; documents?: NewDocument[] }>(event);
  try {
    return { id: createDataset(db, owner(db), body.name ?? "", body.desc ?? "", body.documents ?? []) };
  } catch (e) {
    // These are things the person filling in the form can fix, so they carry
    // the reason rather than becoming a 500.
    throw fail(event, 400, e instanceof Error ? e.message : String(e));
  }
});
