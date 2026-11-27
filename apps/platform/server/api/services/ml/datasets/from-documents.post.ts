import { datasetRows, datasets } from "@legal-blocks/db";
import { documentsToCsv } from "../../../../ml/table";
import { findTrainingSet, trainingSetTag, type TrainingSet } from "../../../../ml/training-set";

/**
 * Sends one of this person's Documents datasets to the ML service, as the
 * table it trains on. This is how Train models gets its data: from Documents,
 * like Annotate, never from an upload of its own.
 *
 * Sending the same documents for the same task again answers with the copy
 * the service already has.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ dataset_id?: number; task_type?: string; name?: string }>(event);
  const id = Number(body?.dataset_id);
  if (!Number.isInteger(id) || id <= 0) throw fail(event, 400, "say which documents to train on");
  const taskType = String(body?.task_type ?? "").trim();
  if (!/^[a-z_]{1,40}$/.test(taskType)) throw fail(event, 400, "choose what the model should learn to do");
  requireDatasetEditor(event, id);

  const db = requireDb(event);
  const rows = datasetRows(db, id);
  if (!rows.length) throw fail(event, 400, "these documents are empty");
  const name = String(body?.name ?? "").trim() || datasets(db).find((d) => d.id === id)!.name;
  const { csv } = documentsToCsv(rows);
  const tag = trainingSetTag(id, csv);

  const { datasets: sent } = await readFromMl<{ datasets?: TrainingSet[] }>(event, "/api/datasets/");
  const existing = findTrainingSet(sent ?? [], tag, taskType);
  if (existing) return { dataset: existing };

  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), `${name.replace(/[^\w.-]+/g, "_")}.csv`);
  form.append("name", name);
  form.append("description", tag);
  form.append("task_type", taskType);
  return uploadToMl(event, "/api/datasets/upload", form);
});
