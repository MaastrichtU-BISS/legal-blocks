// The signed-in person's models, for the workspace's Models tab. Everything
// else about models is the ML workbench's, through its own adapter.

import { json } from "./http";

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
