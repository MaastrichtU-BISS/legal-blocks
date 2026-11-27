// Which training set on the ML service came from which Documents.
//
// The service keeps a copy of every table it is sent. Without a way to tell
// that a table is already there, choosing "Train on these" twice stores the
// same documents twice. The copy carries, in its description, the Documents
// dataset it came from and a fingerprint of its content, so the same table for
// the same task is found again, and a re-imported one with new rows is not.

import { createHash } from "node:crypto";

export interface TrainingSet {
  id: string | number;
  description?: string | null;
  task_type?: string;
}

export function trainingSetTag(datasetId: number, csv: string): string {
  const fingerprint = createHash("sha256").update(csv).digest("hex").slice(0, 12);
  return `From Documents #${datasetId} · ${fingerprint}`;
}

export function findTrainingSet(sets: TrainingSet[], tag: string, taskType: string): TrainingSet | undefined {
  return sets.find((s) => s.description === tag && s.task_type === taskType);
}
