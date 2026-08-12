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

/** The .txt files in the platform's corpus folder, read fresh each call. */
export async function getCorpus(): Promise<CorpusDocument[]> {
  return json(await fetch("/api/corpus"), "loading documents");
}

/**
 * Returns the pipeline this platform runs, or null when the server is in
 * compose mode. That distinction is how the app decides which half of the
 * product to render — there is no build-time flag.
 */
export async function getPipeline(): Promise<Pipeline | null> {
  const res = await fetch("/api/pipeline");
  if (res.status === 404) return null;
  return json(res, "loading pipeline");
}

// --- users ------------------------------------------------------------------

export interface User {
  id: number;
  name: string;
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

/**
 * Stores documents as a named dataset and returns its id.
 *
 * Idempotent. Documents already present keep their id, so annotations made
 * against them survive a corpus that has grown since.
 */
export async function syncDataset(
  name: string,
  documents: CorpusDocument[],
): Promise<number> {
  const out = await post<{ dataset_id: number }>(
    "/api/datasets/sync",
    { name, documents },
    "storing documents",
  );
  return out.dataset_id;
}

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
export async function searchDocuments(query: unknown): Promise<{ nodes?: unknown[] }> {
  return post("/api/services/legal-docs/search", query, "searching for documents");
}

/** Searches legislation, for the query builder's law selector. */
export async function searchLaws(query: string): Promise<unknown[]> {
  const path = `/api/services/legal-docs/laws?q=${encodeURIComponent(query)}`;
  return json(await fetch(path), "searching legislation");
}

// --- composer ---------------------------------------------------------------

export async function validatePipeline(p: Pipeline): Promise<{ valid: boolean; error?: string }> {
  return post("/api/validate", p, "validating pipeline");
}

/**
 * Hands the draft to the composer's own server before previewing it, so any
 * access token it carries reaches the service that needs it.
 *
 * The token goes from the composer's form to the server and stops there: it is
 * held in memory, never written, and never read back. Preview then behaves
 * exactly like the exported platform, where the token comes from
 * credentials.json instead.
 */
export async function preparePreview(p: Pipeline): Promise<void> {
  const res = await fetch("/api/preview", {
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
    throw new Error(`preparing preview: ${detail}`);
  }
}

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
