// The host's HTTP API.
//
// Everything a module reads or writes goes through here and lands in the
// platform's database. Modules own no storage and no network logic of their
// own, which is what lets the same package run against this host, against
// Supabase, or against a fixture.

import type { CorpusDocument, Pipeline, Registry } from "./types";

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = ((await res.json()) as { error?: string }).error ?? detail;
    } catch {
      // Non-JSON error body; the status text will do.
    }
    throw new Error(`${what}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown, what: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return json<T>(res, what);
}

// --- platform ---------------------------------------------------------------

export async function getRegistry(): Promise<Registry> {
  return json(await fetch("/api/registry"), "loading module registry");
}

export async function getPipeline(): Promise<Pipeline | null> {
  const res = await fetch("/api/pipeline");
  if (res.status === 404) return null;
  return json(res, "loading pipeline");
}

// --- users ------------------------------------------------------------------

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

export async function getUsers(): Promise<User[]> {
  return json(await fetch("/api/users"), "loading users");
}

/** Creates users up to `count` if they do not exist, and returns them all. */
export async function ensureUsers(count: number): Promise<User[]> {
  return post("/api/users", { count }, "creating users");
}

// --- datasets and tasks -----------------------------------------------------

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

// --- the shapes the packages consume ----------------------------------------

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

// --- metrics ----------------------------------------------------------------

export async function getTaskAnnotators(taskId: number): Promise<string[]> {
  return json(await fetch(`/api/tasks/${taskId}/annotators`), "loading annotators");
}

export async function getTaskDocuments(
  taskId: number,
): Promise<{ value: string; label: string }[]> {
  return json(await fetch(`/api/tasks/${taskId}/documents`), "loading documents");
}

/** The filtered annotation list. Filtering happens in SQL, not the browser. */
export async function getAnnotations(
  taskId: number,
  filters: { labels: string[]; documents: string[]; annotators: string[] },
): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (filters.labels.length) params.set("labels", filters.labels.join(","));
  if (filters.documents.length) params.set("documents", filters.documents.join(","));
  if (filters.annotators.length) params.set("annotators", filters.annotators.join(","));
  return json(
    await fetch(`/api/tasks/${taskId}/annotations?${params}`),
    "loading annotations",
  );
}

export async function getIaaInput(taskId: number): Promise<unknown> {
  return json(await fetch(`/api/tasks/${taskId}/iaa-input`), "assembling the agreement input");
}

/** Calls a Go service mounted in this binary at /api/services/<id>/. */
export async function callService(
  serviceId: string,
  path: string,
  params: Record<string, string>,
  body: unknown,
): Promise<Response> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/services/${serviceId}/${path}?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = ((await res.json()) as { error?: string }).error ?? detail;
    } catch {
      // Keep the status text.
    }
    throw new Error(`${serviceId}: ${detail}`);
  }
  return res;
}

// --- document search --------------------------------------------------------
//
// Case law search happens on this platform's server, in the legal-docs service.
// That is where the access token is, and it is also why these are two named
// operations rather than a client: the page asks for a search, not for a URL,
// so nothing here can point the platform's credential at another endpoint.

/** Runs one query against one dataset. */
export async function searchDocuments(
  query: unknown,
): Promise<{ nodes?: unknown[]; edges?: unknown[] }> {
  return post("/api/services/legal-docs/search", query, "searching for documents");
}

/** Searches legislation, for the query builder's law selector. */
export async function searchLaws(query: string): Promise<unknown[]> {
  const path = `/api/services/legal-docs/laws?q=${encodeURIComponent(query)}`;
  return json(await fetch(path), "searching legislation");
}

// --- the things a running platform lets people make ------------------------

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

// --- document import -------------------------------------------------------
//
// The page reads plain text itself; everything else goes to the platform's own
// parser, which has real libraries for PDF, Word and HTML behind it. Shipping
// those to every visitor would be a lot of JavaScript to solve a problem the
// server solves once.

/** What this build can parse, for the file picker's accept list. */
export async function importFormats(): Promise<string[]> {
  const res = await fetch("/api/services/docs-import/formats");
  const body = (await json(res, "asking what can be imported")) as { extensions?: string[] };
  return body.extensions ?? [];
}

/** One file's text, parsed on the server. */
export async function parseDocument(
  file: File,
): Promise<{ text: string; metadata?: Record<string, unknown> }> {
  const body = new FormData();
  body.append("files", file);
  const res = await fetch("/api/services/docs-import/import", { method: "POST", body });
  const result = (await json(res, `reading ${file.name}`)) as {
    documents?: { full_text: string; metadata?: Record<string, unknown> }[];
    skipped?: { reason: string }[];
  };
  const doc = result.documents?.[0];
  if (!doc) {
    // The importer answers with a reason per file; passing it straight through
    // is what lets the component tell somebody why their file was skipped.
    throw new Error(result.skipped?.[0]?.reason ?? "this file could not be read");
  }
  return { text: doc.full_text, metadata: doc.metadata };
}

/** Stores uploaded documents as a new dataset. */
export async function createDataset(
  name: string,
  documents: { name: string; source: string; full_text: string }[],
): Promise<number> {
  const body = await post<{ id: number }>(
    "/api/datasets",
    { name, documents },
    "saving these documents",
  );
  return body.id;
}

// --- composer ---------------------------------------------------------------

/** Asks the host to build the platform zip and hands it to the browser. */
export async function exportPipeline(p: Pipeline): Promise<void> {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = ((await res.json()) as { error?: string }).error ?? detail;
    } catch {
      // Keep the status text.
    }
    throw new Error(`export failed: ${detail}`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = match?.[1] ?? "platform.zip";
  a.click();
  URL.revokeObjectURL(url);
}
