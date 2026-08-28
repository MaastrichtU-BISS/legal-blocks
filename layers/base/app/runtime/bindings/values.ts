// Turning what arrives on a port into what a module actually wants.
//
// Every contract needs some of this and none of it belongs to one of them, so
// it sits between the port types and the contracts that speak them.

import { getDatasetDocuments } from "../../api";
import type { BindingContext, CorpusValue, ResultNode } from "./types";

/** Resolves a corpus port to plain documents, whichever kind produced it. */
export async function documentsOf(
  value: CorpusValue,
): Promise<{ name: string; full_text: string }[]> {
  if (value.kind === "documents") return value.documents;
  if (value.kind === "results") {
    // Unreachable through a pipeline: no adapter turns a document set into a
    // corpus, so the composer will not let one be connected here. If it ever
    // arrives, something built this value by hand, and quietly treating a
    // case's summary as its text is the mistake worth failing over.
    throw new Error(
      "search results are not annotatable documents — a preprocessing step has to fetch the full text first",
    );
  }
  return getDatasetDocuments(value.datasetId);
}

/**
 * Resolves a port to case-law documents, for a module that renders them.
 *
 * Only search produces these. Anything else — an upload, a stored dataset — is
 * text with a filename, so it is presented as a document with nothing else
 * known about it rather than being dropped.
 */
export async function resultsOf(value: CorpusValue): Promise<ResultNode[]> {
  if (value.kind === "results") return value.nodes;
  const documents = await documentsOf(value);
  return documents.map((d) => ({ id: d.name, data: { ecli: d.name, summary: d.full_text } }));
}

/**
 * The task these steps are working on.
 *
 * In a stored platform every task is made by somebody in the Tasks tab, so
 * there is always one open by the time a step mounts. Reaching here without one
 * means a step was mounted outside the workspace, which is a wiring mistake
 * rather than something to paper over by inventing a task.
 */
export function requireTask(ctx: BindingContext): number {
  if (!ctx.taskId) {
    throw new Error("no task is open — open one from the Tasks tab");
  }
  return ctx.taskId;
}
