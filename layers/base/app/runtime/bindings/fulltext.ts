// Get full text. Reads what a search found and produces documents with their
// text: corpus@1, which Annotate reads.
//
// In a pipeline the documents go to the next step. In a stored platform they
// become a dataset, named like any other upload, which tasks are made from.

import { createDataset, fetchFullText } from "../../api";
import { latestSearchResults } from "./documents";
import type { BindingContext, CorpusValue, KindBindings, ResultNode } from "./types";

/** Documents fetched for the session, per step, when nothing is stored. */
const sessionDocuments = new Map<string, { name: string; full_text: string }[]>();

function found(nodes: ResultNode[]) {
  return nodes.map((n) => ({
    ecli: String(n.data["ecli"] ?? n.id),
    dataset: typeof n.data["dataset"] === "string" ? (n.data["dataset"] as string) : undefined,
  }));
}

function limitOf(ctx: BindingContext): number {
  const limit = Number(ctx.config["limit"]);
  return Number.isFinite(limit) && limit > 0 ? limit : 50;
}

export const FullText: KindBindings = {
  pipeline: {
    async props(ctx) {
      const value = (await ctx.input("documents")) as CorpusValue;
      const nodes = value.kind === "results" ? value.nodes : [];
      return {
        results: () => found(nodes),
        limit: limitOf(ctx),
        fetch: fetchFullText,
        keepLabel: "Use these documents",
        keep: async (documents: { name: string; full_text: string }[]) => {
          sessionDocuments.set(ctx.nodeId, documents);
          ctx.produced();
        },
      };
    },
    async output(ctx): Promise<CorpusValue> {
      return { kind: "documents", documents: sessionDocuments.get(ctx.nodeId) ?? [] };
    },
  },

  workspace: {
    async props(ctx) {
      return {
        results: () => found(latestSearchResults()),
        limit: limitOf(ctx),
        fetch: fetchFullText,
        keepLabel: "Save as documents",
        keep: async (documents: { name: string; source: string; full_text: string }[]) => {
          await createDataset(ctx.datasetName ?? "Judgments", documents);
          ctx.refresh();
        },
      };
    },
    async output(): Promise<CorpusValue> {
      // Saved as a dataset; nothing travels to a fixed next step.
      return { kind: "documents", documents: [] };
    },
  },
};
