// The three things a running platform lets people make.

import type { CorpusDocument } from "../types";
import { json, post } from "./http";

export interface Label {
  name: string;
  color?: string;
}

export interface LabelsetSummary {
  id: number;
  name: string;
  desc: string;
  labels: Label[];
  task_count: number;
}

export interface DatasetSummary {
  id: number;
  name: string;
  desc: string;
  documents: number;
  task_count: number;
}

export interface TaskSummary {
  id: number;
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

export async function getTasks(): Promise<TaskSummary[]> {
  return json(await fetch("/api/tasks"), "loading tasks");
}

export async function createTask(spec: TaskSpec): Promise<number> {
  const out = await post<{ id: number }>("/api/tasks", spec, "creating the task");
  return out.id;
}
