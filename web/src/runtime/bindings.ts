// Host bindings — the runtime's side of each module's data-access contract.
//
// A binding is keyed by the manifest's `host` field, not by module id. That
// distinction is the point: the runtime implements *contracts*, so a second
// annotation module declaring `"host": "AnnotationSource"` would work here
// with no frontend change at all. A module introducing a genuinely new
// contract needs a binding added below, which is the honest cost of a new kind
// of module.
//
// Since everything lives in one database, what an output port carries is a
// *reference* — a dataset id, a task id — not the data itself. Two modules
// looking at the same task look at the same rows rather than at two copies
// that can drift, and a step that opens does not drag the whole upstream chain
// into memory to find out what it is working on.

import { ensureUsers, getCorpus, getDatasetDocuments, syncDataset, syncTask } from "../api";
import { createAnnotationSource } from "../sources/annotation";
import { createMetricsSource, loadMetricsTask } from "../sources/metrics";

/** A reference to a stored dataset — what a corpus@1 or document-set@1 port carries. */
export interface DatasetRef {
  datasetId: number;
}

/** A reference to a stored task — what an annotated-task@1 port carries. */
export interface TaskRef {
  taskId: number;
}

/** What a binding is given when the runtime mounts or resolves a node. */
export interface BindingContext {
  nodeId: string;
  config: Record<string, unknown>;
  /** The current user's id. The seam a real login replaces. */
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

/** Splits the comma-separated labels field of the annotate step's settings. */
function parseLabels(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const bindings: Record<string, Binding> = {
  // The static input folder. Reading the folder and storing it as a dataset is
  // idempotent: documents already there keep their id, so adding a file never
  // disturbs annotations made on the ones that were there before.
  Corpus: {
    async props() {
      return { documents: await getCorpus() };
    },
    async output(ctx): Promise<DatasetRef> {
      const documents = await getCorpus();
      const datasetId = await syncDataset(String(ctx.config.dataset_name ?? "corpus"), documents);
      return { datasetId };
    },
  },

  // legal-annotation-kit. The task is brought in line with this step's
  // settings on every visit, then the source reads it a row at a time.
  AnnotationSource: {
    async props(ctx) {
      const taskId = await ensureTask(ctx);
      const [source, task] = await Promise.all([
        createAnnotationSource(taskId, ctx.annotator),
        loadMetricsTask(taskId),
      ]);
      return {
        source,
        labelset: task.labelset,
        annotationLevel: task.annotation_level,
        guidelinesUrl: task.ann_guidelines || undefined,
      };
    },
    async output(ctx): Promise<TaskRef> {
      return { taskId: await ensureTask(ctx) };
    },
  },

  // vue-iaa-metrics. Reads the task produced upstream; compute and download go
  // to the Go service compiled into this binary.
  MetricsSource: {
    async props(ctx) {
      const { taskId } = (await ctx.input("task")) as TaskRef;
      const task = await loadMetricsTask(taskId);
      return {
        source: createMetricsSource(taskId, task),
        reportFilename: `${task.name || "iaa"}-report.zip`,
      };
    },
    async output(ctx): Promise<TaskRef> {
      return (await ctx.input("task")) as TaskRef;
    },
  },

  // vue-legal-query-builder. Results are stored as a dataset, so they persist
  // across a reload and can be annotated like any other documents.
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

          await syncDataset(searchDatasetName(ctx), toDocuments(result.nodes ?? []));
          ctx.refresh();
          return result;
        },
      };
    },
    async output(ctx): Promise<DatasetRef> {
      // Empty until a search has run; syncDataset with no documents just
      // creates the dataset, so downstream steps see an empty corpus rather
      // than an error.
      const datasetId = await syncDataset(searchDatasetName(ctx), []);
      return { datasetId };
    },
  },

  // vue-legal-docs-visualizer. Displays its input and passes the reference
  // along unchanged, so it can sit anywhere in a chain.
  DocumentPassthrough: {
    async props(ctx) {
      const { datasetId } = (await ctx.input("documents")) as DatasetRef;
      return { docs: await getDatasetDocuments(datasetId) };
    },
    async output(ctx): Promise<DatasetRef> {
      return (await ctx.input("documents")) as DatasetRef;
    },
  },
};

function searchDatasetName(ctx: BindingContext): string {
  return `search:${ctx.nodeId}`;
}

/** Maps search results to storable documents, keeping the original record. */
function toDocuments(nodes: unknown[]): { name: string; full_text: string }[] {
  const out: { name: string; full_text: string }[] = [];
  nodes.forEach((node, i) => {
    const doc = node as { id?: string; data?: Record<string, unknown> };
    const data = (doc.data ?? doc) as Record<string, unknown>;
    const textField = ["full_text", "fullText", "text", "summary"].find(
      (k) => typeof data[k] === "string" && (data[k] as string).trim() !== "",
    );
    if (!textField) return;
    const nameField = ["ecli", "title", "docname", "name", "id"].find(
      (k) => typeof data[k] === "string" && (data[k] as string).trim() !== "",
    );
    out.push({
      name: String(nameField ? data[nameField] : (doc.id ?? `document-${i + 1}`)),
      full_text: data[textField] as string,
    });
  });
  return out;
}

/**
 * Makes sure the annotate step's task matches its settings, and returns its
 * id. Idempotent, so it runs on every visit and picks up a changed labelset or
 * annotator count without discarding anything already annotated.
 */
async function ensureTask(ctx: BindingContext): Promise<number> {
  const { datasetId } = (await ctx.input("corpus")) as DatasetRef;
  const annotators = Math.max(1, Number(ctx.config.annotators ?? 2) || 1);
  await ensureUsers(annotators);
  return syncTask(datasetId, {
    name: String(ctx.config.task_name ?? "Annotation task"),
    guidelines: String(ctx.config.guidelines_url ?? ""),
    annotation_level: String(ctx.config.annotation_level ?? "word"),
    labels: parseLabels(ctx.config.labels),
    annotators,
  });
}

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
