// The one call only the composer makes.

import type { Pipeline } from "../types";

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
