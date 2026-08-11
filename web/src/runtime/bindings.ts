// Host bindings — the runtime's side of each module's data-access contract.
//
// A binding is keyed by the manifest's `host` field, not by module id. That
// distinction is the point: the runtime implements *contracts*, so a second
// annotation module declaring `"host": "AnnotationSource"` would work here
// with no frontend change at all. A module introducing a genuinely new
// contract needs a binding added below, which is the honest cost of a new kind
// of module.
//
// Each binding says two things: which props to hand the component, and how to
// produce the value of each of its output ports.

import { getCorpus, store } from "../api";
import { createAnnotationSource } from "../sources/annotation";
import { createMetricsSource } from "../sources/metrics";
import { loadTask, storeKey } from "../sources/task";
import type { CorpusDocument } from "../types";

/** What a binding is given when the runtime mounts or resolves a node. */
export interface BindingContext {
  nodeId: string;
  config: Record<string, unknown>;
  /** The current annotator's id. The seam a real login replaces. */
  annotator: number;
  /** Resolves the value arriving on one of this node's input ports. */
  input(portName: string): Promise<unknown>;
  /** Re-runs the current step, after something changes its inputs. */
  refresh(): void;
}

export interface Binding {
  /** Props (and `onEvent` handlers) for the module's component. */
  props(ctx: BindingContext): Promise<Record<string, unknown>>;
  /** The value carried by one of the module's output ports. */
  output(ctx: BindingContext, portName: string): Promise<unknown>;
}

const bindings: Record<string, Binding> = {
  // The static input folder. Nothing to configure and nothing to persist —
  // the folder on disk is the state.
  Corpus: {
    async props() {
      return { documents: await getCorpus() };
    },
    async output() {
      return await getCorpus();
    },
  },

  // legal-annotation-kit. The task is created on first visit from whatever the
  // corpus input resolves to, then updated in place as annotators work.
  AnnotationSource: {
    async props(ctx) {
      const corpus = (await ctx.input("corpus")) as CorpusDocument[];
      const task = await loadTask(ctx.nodeId, corpus, ctx.config);
      return {
        source: createAnnotationSource(ctx.nodeId, task, ctx.annotator),
        labelset: task.labelset,
        annotationLevel: task.annotation_level,
        guidelinesUrl: task.ann_guidelines || undefined,
      };
    },
    async output(ctx) {
      const corpus = (await ctx.input("corpus")) as CorpusDocument[];
      return await loadTask(ctx.nodeId, corpus, ctx.config);
    },
  },

  // vue-iaa-metrics. Reads the task produced upstream; the compute and
  // download calls go to the Go service compiled into this binary.
  MetricsSource: {
    async props(ctx) {
      const task = (await ctx.input("task")) as Awaited<ReturnType<typeof loadTask>>;
      return {
        source: createMetricsSource(task),
        reportFilename: `${task.name || "iaa"}-report.zip`,
      };
    },
    async output(ctx) {
      return await ctx.input("task");
    },
  },

  // vue-legal-query-builder. Results are persisted so a refresh does not throw
  // away a search, and so downstream steps have something to read.
  DocumentSearch: {
    async props(ctx) {
      return {
        title: ctx.config.title ?? "Find documents",
        onSubmit: async (query: unknown) => {
          const { createLegalDocsClient } = await import("vue-legal-query-builder");
          const client = createLegalDocsClient({
            baseURL: String(ctx.config.api_base_url ?? ""),
          });
          const q = query as { dataset: string; params: Record<string, unknown> };
          const result =
            q.dataset === "ECHR"
              ? await client.fetchEchr(q.params as never)
              : await client.fetchRechtspraak(q.params as never);
          const documents = result.nodes ?? [];
          await store.put(storeKey(ctx.nodeId, "documents"), documents);
          ctx.refresh();
          return result;
        },
      };
    },
    async output(ctx) {
      return (await store.get(storeKey(ctx.nodeId, "documents"))) ?? [];
    },
  },

  // vue-legal-docs-visualizer. Displays its input and passes it along
  // unchanged, so it can sit anywhere in a chain without affecting the data.
  DocumentPassthrough: {
    async props(ctx) {
      return { docs: await ctx.input("documents") };
    },
    async output(ctx) {
      return await ctx.input("documents");
    },
  },
};

export function bindingFor(host: string | undefined): Binding {
  if (!host) {
    throw new Error("module manifest has no host contract");
  }
  const binding = bindings[host];
  if (!binding) {
    throw new Error(
      `no host binding for contract "${host}" — add one in web/src/runtime/bindings.ts`,
    );
  }
  return binding;
}
