// The signed-in person's models and training sets, for the workspace's lists.
// Everything else about them is the ML workbench's, through its own adapter.

import { json, remove } from "./http";

export interface MlModelSummary {
  id: string;
  name: string;
  model_type: string;
  status: string;
  metrics?: { accuracy?: number } | null;
}

export async function getMlModels(): Promise<MlModelSummary[]> {
  const body = await json<{ models: MlModelSummary[] }>(
    await fetch("/api/services/ml/models/"),
    "loading your models",
  );
  return body.models;
}

export async function removeMlModel(id: string): Promise<void> {
  return remove(`/api/services/ml/models/${encodeURIComponent(id)}`, "removing the model");
}

/** The service deletes the models trained on it with it. */
export async function removeTrainingSet(id: string): Promise<void> {
  return remove(`/api/services/ml/datasets/${encodeURIComponent(id)}`, "removing the training set");
}
