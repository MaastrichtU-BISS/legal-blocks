// Agreement metrics, and the whole-task download beside them.

import { json } from "./http";

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
