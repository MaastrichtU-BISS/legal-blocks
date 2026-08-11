// The host's HTTP API. Everything the frontend persists or computes goes
// through here, which is what keeps modules free of any storage or network
// concerns of their own.

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

export async function getRegistry(): Promise<Registry> {
  return json(await fetch("/api/registry"), "loading module registry");
}

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

export const store = {
  async get<T>(key: string): Promise<T | null> {
    const res = await fetch(`/api/store/${encodeURIComponent(key)}`);
    if (res.status === 404) return null;
    return json(res, `reading ${key}`);
  },

  async put(key: string, value: unknown): Promise<void> {
    const res = await fetch(`/api/store/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    if (!res.ok) throw new Error(`saving ${key}: ${res.statusText}`);
  },

  async remove(key: string): Promise<void> {
    const res = await fetch(`/api/store/${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`deleting ${key}: ${res.statusText}`);
  },
};

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

export async function validatePipeline(p: Pipeline): Promise<{ valid: boolean; error?: string }> {
  const res = await fetch("/api/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  return json(res, "validating pipeline");
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
