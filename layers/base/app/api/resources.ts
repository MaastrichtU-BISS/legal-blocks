// The three things a running platform lets people make.

import type { CorpusDocument } from "../types";
import { json, post, remove } from "./http";

export interface Label {
  name: string;
  color?: string;
}

export interface LabelsetSummary {
  id: number;
  /** Who made it, and so who edits it. */
  user_id: number;
  name: string;
  desc: string;
  labels: Label[];
  task_count: number;
}

export interface DatasetSummary {
  id: number;
  /** Who made it, and so who edits it. */
  user_id: number;
  name: string;
  desc: string;
  documents: number;
  task_count: number;
}

export interface TaskSummary {
  id: number;
  /** Who made it, and so who edits it. */
  user_id: number;
  name: string;
  desc: string;
  annotation_level: string;
  dataset_id: number;
  dataset_name: string;
  labelset_id: number;
  labelset_name: string;
  annotators: User[];
  documents: number;
  done: number;
  total: number;
}

export interface TaskSpec {
  name: string;
  desc?: string;
  dataset_id: number;
  labelset_id: number;
  annotation_level: string;
  ann_guidelines?: string;
  /** Email addresses. They need not have used this platform before. */
  annotators: string[];
}

export async function getLabelsets(): Promise<LabelsetSummary[]> {
  return json(await fetch("/api/labelsets"), "loading labelsets");
}

export async function createLabelset(
  name: string,
  desc: string,
  labels: Label[],
): Promise<number> {
  const out = await post<{ id: number }>(
    "/api/labelsets",
    { name, desc, labels },
    "saving the labelset",
  );
  return out.id;
}

export async function getDatasets(): Promise<DatasetSummary[]> {
  return json(await fetch("/api/datasets"), "loading datasets");
}

export async function removeDataset(id: number): Promise<void> {
  return remove(`/api/datasets/${id}`, "removing these documents");
}

export async function getTasks(): Promise<TaskSummary[]> {
  return json(await fetch("/api/tasks"), "loading tasks");
}

export async function createTask(spec: TaskSpec): Promise<number> {
  const out = await post<{ id: number }>("/api/tasks", spec, "creating the task");
  return out.id;
}

export async function removeLabelset(id: number): Promise<void> {
  return remove(`/api/labelsets/${id}`, "removing these labels");
}

export async function removeTask(id: number): Promise<void> {
  return remove(`/api/tasks/${id}`, "removing the task");
}
