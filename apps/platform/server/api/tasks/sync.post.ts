import { syncTask } from "@legal-blocks/db";

import type { TaskConfig } from "@legal-blocks/db";

/**
 * Brings the task for a dataset in line with the annotate step's settings and
 * returns its id. Called every time that step is opened, so changing labels or
 * annotator count takes effect without losing work.
 */
export default defineEventHandler(async (event) => {
  const db = requireDb(event);
  const body = await readBody<{ dataset_id?: number; config?: TaskConfig }>(event);
  if (!body.dataset_id) throw fail(event, 400, "dataset_id is required");
  if (!body.config) throw fail(event, 400, "config is required");
  return { task_id: syncTask(db, owner(db), body.dataset_id, body.config) };
});
