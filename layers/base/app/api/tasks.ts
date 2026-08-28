// Tasks, and the assignments inside them — what the annotation kit reads and
// writes as somebody works through a queue.

import type { CorpusDocument } from "../types";
import { json, post } from "./http";

/** A dataset's documents, as stored. */
export async function getDatasetDocuments(datasetId: number): Promise<CorpusDocument[]> {
  return json(await fetch(`/api/datasets/${datasetId}/documents`), "loading documents");
}

export interface TaskConfig {
  name: string;
  guidelines: string;
  annotation_level: string;
  labels: string[];
  annotators: number;
}

/**
 * Brings the task for a dataset in line with the annotate step's settings and
 * returns its id. Called whenever that step is opened, so changing the labels
 * or the annotator count takes effect without discarding work.
 */
export async function syncTask(datasetId: number, config: TaskConfig): Promise<number> {
  const out = await post<{ task_id: number }>(
    "/api/tasks/sync",
    { dataset_id: datasetId, config },
    "preparing the task",
  );
  return out.task_id;
}

export interface Task {
  id: number;
  name: string;
  desc: string;
  ann_guidelines: string;
  annotation_level: string;
  labelset: { name: string; desc: string; labels: { name: string; color: string }[] };
}

export interface QueueEntry {
  assignment_id: number;
  name: string;
  order: number;
  status: string;
}

export async function getTask(taskId: number): Promise<Task> {
  return json(await fetch(`/api/tasks/${taskId}`), "loading the task");
}

export async function getQueue(taskId: number, userId: number): Promise<QueueEntry[]> {
  return json(await fetch(`/api/tasks/${taskId}/queue?user_id=${userId}`), "loading the queue");
}

export async function getBundle(assignmentId: number): Promise<unknown> {
  return json(await fetch(`/api/assignments/${assignmentId}`), "loading the document");
}

export async function saveAssignment(assignmentId: number, assignment: unknown): Promise<void> {
  const res = await fetch(`/api/assignments/${assignmentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(assignment),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = ((await res.json()) as { error?: string }).error ?? detail;
    } catch {
      // Keep the status text.
    }
    throw new Error(`saving your work: ${detail}`);
  }
}

export async function getIncomingRelations(assignmentId: number): Promise<unknown> {
  return json(
    await fetch(`/api/assignments/${assignmentId}/incoming`),
    "loading incoming relations",
  );
}

/**
 * How far along one annotator, or one document, is. `done` is picked up at
 * all, `finished` is marked done — see packages/db for why both.
 */
export interface ProgressRow {
  id: number;
  name: string;
  done: number;
  finished: number;
  total: number;
}

export interface TaskProgress {
  done: number;
  finished: number;
  total: number;
  byAnnotator: ProgressRow[];
  byDocument: ProgressRow[];
}

export async function getTaskProgress(taskId: number): Promise<TaskProgress> {
  return json(await fetch(`/api/tasks/${taskId}/progress`), "loading progress");
}

/**
 * Saves the whole task as JSON, in Lawnotation's task-export shape.
 *
 * Not the agreement service's input, which is what this used to send: that is
 * a subset built for a service that only compares labels, so the file arrived
 * with the annotations but not the task name, the guidelines, the level they
 * were made at, or any counts to check them against.
 */
export async function downloadTask(taskId: number, name: string): Promise<void> {
  const data = await json<unknown>(
    await fetch(`/api/tasks/${taskId}/export`),
    "preparing the download",
  );
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(name || "task").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "") || "task"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
