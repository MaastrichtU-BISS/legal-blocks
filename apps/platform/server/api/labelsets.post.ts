import { createLabelset } from "@legal-blocks/db";

import type { Label } from "@legal-blocks/db";

export default defineEventHandler(async (event) => {
  const db = requireDb(event);
  const body = await readBody<{ name?: string; desc?: string; labels?: Label[] }>(event);
  try {
    return { id: createLabelset(db, owner(db), body.name ?? "", body.desc ?? "", body.labels ?? []) };
  } catch (e) {
    throw fail(event, 400, e instanceof Error ? e.message : String(e));
  }
});
