// What removing each kind of row means.

import type { DatasetSummary, LabelsetSummary, MlModelSummary, TaskSummary } from "../api";
import { removeDataset, removeLabelset, removeMlModel, removeTask } from "../api";
import type { Removal } from "./removal";

function usedBy(tasks: number, what: string): string | undefined {
  if (tasks === 0) return undefined;
  return `${tasks === 1 ? "A task uses" : `${tasks} tasks use`} ${what}. Remove the task first.`;
}

export const datasetRemoval: Removal<DatasetSummary> = {
  name: (d) => d.name,
  consequence: (d) => (d.documents === 1 ? "its document" : `its ${d.documents.toLocaleString()} documents`),
  // The server refuses too, and counts more precisely: a task can draw on
  // documents from a dataset it was not made from.
  blocked: (d) => usedBy(d.task_count, "these documents"),
  remove: (d) => removeDataset(d.id),
};

export const labelsetRemoval: Removal<LabelsetSummary> = {
  name: (l) => l.name,
  blocked: (l) => usedBy(l.task_count, "these labels"),
  remove: (l) => removeLabelset(l.id),
};

/** Annotators see the tasks they were given, but only whoever made one removes it. */
export function taskRemoval(me: () => number | undefined): Removal<TaskSummary> {
  return {
    name: (t) => t.name,
    allowed: (t) => me() === undefined || me() === t.user_id,
    consequence: () => "everyone's annotations in it",
    remove: (t) => removeTask(t.id),
  };
}

export const modelRemoval: Removal<MlModelSummary> = {
  name: (m) => m.name,
  remove: (m) => removeMlModel(m.id),
};
