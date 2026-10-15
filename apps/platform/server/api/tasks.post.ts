import { createTask } from "@legal-blocks/db";

import type { TaskSpec } from "@legal-blocks/db";

export default defineEventHandler(async (event) => {
  const me = requireRole(event, "editor");
  const db = requireDb(event);
  const spec = await readBody<TaskSpec>(event);
  try {
    return { id: createTask(db, me.id, spec) };
  } catch (e) {
    throw fail(event, 400, e instanceof Error ? e.message : String(e));
  }
});
