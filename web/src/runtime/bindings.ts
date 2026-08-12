// Host bindings — the runtime's side of each module's data-access contract.
//
// Two things are separated here, and keeping them separate is what lets one
// set of packages build very different platforms:
//
//   the port type says WHAT data flows        (corpus@1, annotated-task@1)
//   the pipeline's mode says WHERE it lives   (ephemeral / persistent)
//   the binding says HOW the module gets it   (a source built either way)
//
// A module declares only the first two of those — its ports and the contract
// it wants — and never learns which mode it is running in. That is not a
// convention this project invented: legal-annotation-kit ships createBulkSource
// "for hosts with no backend to save to" alongside createLazySource "for hosts
// with an external backend". The packages already say the host decides.
//
// So a binding is keyed by contract, and each contract has one implementation
// per mode. A new module reusing an existing contract needs nothing here at
// all; a genuinely new kind of module needs one entry, which is the honest
// cost of a new kind of module.

import {
  ensureUsers,
  getCorpus,
  getDatasetDocuments,
  searchDocuments,
  searchLaws,
  syncDataset,
  syncTask,
} from "../api";
import { createAnnotationSource } from "../sources/annotation";
import { createMetricsSource, loadMetricsTask } from "../sources/metrics";
import {
  buildTask,
  collectTask,
  createSessionAnnotationSource,
  createSessionMetricsSource,
} from "../sources/memory";
import type { TaskData } from "legal-annotation-kit";
import type { Mode } from "../types";

/** What a corpus@1 or document-set@1 port carries. */
export type CorpusValue =
  /** persistent: rows in the database */
  | { kind: "dataset"; datasetId: number }
  /** ephemeral: the documents themselves, held for the session */
  | { kind: "documents"; documents: { name: string; full_text: string }[] };

/** What an annotated-task@1 port carries. */
export type TaskValue =
  /** persistent: rows in the database */
  | { kind: "task"; taskId: number }
  /**
   * ephemeral: the task itself, plus the node whose saved work belongs to it.
   *
   * The task travels rather than being rebuilt downstream. A later step cannot
   * re-resolve the annotate step's inputs — its own edges are the only ones it
   * can follow — so whatever it needs has to arrive on the port.
   */
  | { kind: "session"; nodeId: string; task: TaskData };

/** What a binding is given when the runtime mounts or resolves a node. */
export interface BindingContext {
  nodeId: string;
  config: Record<string, unknown>;
  /** Where this platform's data lives. */
  mode: Mode;
  /** The current user. A row id when persistent, a position when not. */
  annotator: number;
  /** Resolves the value arriving on one of this node's input ports. */
  input(portName: string): Promise<unknown>;
  /** Re-runs the current step, after something changes its inputs. */
  refresh(): void;
}

/** One contract, implemented once per mode. */
export interface Binding {
  props(ctx: BindingContext): Promise<Record<string, unknown>>;
  output(ctx: BindingContext, portName: string): Promise<unknown>;
}

type ModeBindings = Partial<Record<Mode, Binding>>;

/** Resolves a corpus port to plain documents, whichever mode produced it. */
async function documentsOf(value: CorpusValue): Promise<{ name: string; full_text: string }[]> {
  return value.kind === "documents" ? value.documents : getDatasetDocuments(value.datasetId);
}

const contracts: Record<string, ModeBindings> = {
  // The input folder. Persistently it becomes a dataset whose documents keep
  // their ids, so adding a file never disturbs existing annotations. In a
  // session it is simply the files, read fresh.
  Corpus: {
    persistent: {
      async props() {
        return { documents: await getCorpus() };
      },
      async output(ctx): Promise<CorpusValue> {
        const documents = await getCorpus();
        const datasetId = await syncDataset(
          String(ctx.config.dataset_name ?? "corpus"),
          documents,
        );
        return { kind: "dataset", datasetId };
      },
    },
    ephemeral: {
      async props() {
        return { documents: await getCorpus() };
      },
      async output(): Promise<CorpusValue> {
        return { kind: "documents", documents: await getCorpus() };
      },
    },
  },

  // legal-annotation-kit. The same component both ways; only the source differs.
  AnnotationSource: {
    persistent: {
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
      async output(ctx): Promise<TaskValue> {
        return { kind: "task", taskId: await ensureTask(ctx) };
      },
    },
    ephemeral: {
      async props(ctx) {
        const task = await sessionTask(ctx);
        return {
          source: createSessionAnnotationSource(ctx.nodeId, task, ctx.annotator),
          labelset: task.labelset,
          annotationLevel: task.annotation_level,
          guidelinesUrl: String(ctx.config.guidelines_url ?? "") || undefined,
        };
      },
      async output(ctx): Promise<TaskValue> {
        const corpus = await documentsOf((await ctx.input("corpus")) as CorpusValue);
        return { kind: "session", nodeId: ctx.nodeId, task: buildTask(corpus, ctx.config) };
      },
    },
  },

  // vue-iaa-metrics. Reads the task the annotate step produced and passes it
  // through: a report is computed on demand and downloaded, never handed to a
  // later step, so the task is what continues along the chain. The Go service
  // needs no storage either way — it is given a task and returns a report — so
  // this module works in both modes untouched.
  MetricsSource: {
    persistent: {
      async props(ctx) {
        const value = (await ctx.input("task")) as TaskValue;
        if (value.kind !== "task") throw new Error("expected a stored task");
        const task = await loadMetricsTask(value.taskId);
        return {
          source: createMetricsSource(value.taskId, task),
          reportFilename: `${task.name || "iaa"}-report.zip`,
        };
      },
      async output(ctx): Promise<TaskValue> {
        return (await ctx.input("task")) as TaskValue;
      },
    },
    ephemeral: {
      async props(ctx) {
        const task = await sessionTaskFrom(ctx);
        return {
          source: createSessionMetricsSource(task),
          reportFilename: `${task.name || "iaa"}-report.zip`,
        };
      },
      async output(ctx): Promise<TaskValue> {
        return (await ctx.input("task")) as TaskValue;
      },
    },
  },

  // The exit a platform with no storage needs: with a database the work is
  // already kept, without one it has to be taken out.
  ResultsDownload: {
    ephemeral: {
      async props(ctx) {
        return { task: await sessionTaskFrom(ctx) };
      },
      async output(ctx): Promise<TaskValue> {
        return (await ctx.input("task")) as TaskValue;
      },
    },
  },

  // vue-legal-query-builder. Persistently, results become a dataset so they
  // outlive the session; otherwise they are held for as long as the tab is.
  DocumentSearch: {
    persistent: {
      async props(ctx) {
        return searchProps(ctx, async (documents) => {
          await syncDataset(searchDatasetName(ctx), documents);
        });
      },
      async output(ctx): Promise<CorpusValue> {
        // Creating it empty means a downstream step sees no documents rather
        // than an error before the first search has run.
        return { kind: "dataset", datasetId: await syncDataset(searchDatasetName(ctx), []) };
      },
    },
    ephemeral: {
      async props(ctx) {
        return searchProps(ctx, async (documents) => {
          sessionResults.set(ctx.nodeId, documents);
        });
      },
      async output(ctx): Promise<CorpusValue> {
        return { kind: "documents", documents: sessionResults.get(ctx.nodeId) ?? [] };
      },
    },
  },

  // vue-legal-docs-visualizer. A pure view: it renders what it is given and
  // passes the reference on unchanged, so it works identically either way.
  DocumentPassthrough: {
    persistent: {
      async props(ctx) {
        return { docs: await documentsOf((await ctx.input("documents")) as CorpusValue) };
      },
      async output(ctx): Promise<CorpusValue> {
        return (await ctx.input("documents")) as CorpusValue;
      },
    },
    ephemeral: {
      async props(ctx) {
        return { docs: await documentsOf((await ctx.input("documents")) as CorpusValue) };
      },
      async output(ctx): Promise<CorpusValue> {
        return (await ctx.input("documents")) as CorpusValue;
      },
    },
  },
};

/** Search results held for the session, when nothing is being stored. */
const sessionResults = new Map<string, { name: string; full_text: string }[]>();

function searchDatasetName(ctx: BindingContext): string {
  return `search:${ctx.nodeId}`;
}

/**
 * The query builder's props, differing only in what happens to the results.
 *
 * The form builds queries and never sends one — both of these hand the work to
 * this platform's own legal-docs service, which holds the access token and
 * calls the API itself. Nothing on this page has a credential, and nothing on
 * it can choose an endpoint: it asks for a search, not for a URL.
 */
async function searchProps(
  ctx: BindingContext,
  keep: (documents: { name: string; full_text: string }[]) => Promise<void>,
): Promise<Record<string, unknown>> {
  return {
    title: ctx.config.title ?? "Find documents",

    onSubmit: async (query: unknown) => {
      const result = await searchDocuments(query);
      await keep(toDocuments(result.nodes ?? []));
      ctx.refresh();
      return result;
    },

    // The law selector looks legislation up as the user types. Without this
    // callback the block says so, rather than appearing to find nothing.
    onSearchLaws: searchLaws,
  };
}

/** Maps search results to documents with usable text. */
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

/** The session task this annotate step works on, with saved work merged in. */
async function sessionTask(ctx: BindingContext): Promise<TaskData> {
  const corpus = await documentsOf((await ctx.input("corpus")) as CorpusValue);
  return collectTask(ctx.nodeId, buildTask(corpus, ctx.config));
}

/**
 * The session task a downstream step is reporting on: the skeleton that
 * arrived on the port, with every annotator's saved work merged into it. This
 * is the ephemeral counterpart of reading a task back out of the database.
 */
async function sessionTaskFrom(ctx: BindingContext): Promise<TaskData> {
  const value = (await ctx.input("task")) as TaskValue;
  if (value.kind !== "session") throw new Error("expected a session task");
  return collectTask(value.nodeId, value.task);
}

/**
 * Brings the stored task in line with the annotate step's settings.
 * Idempotent, so it runs on every visit and picks up a changed labelset or
 * annotator count without discarding anything already annotated.
 */
async function ensureTask(ctx: BindingContext): Promise<number> {
  const value = (await ctx.input("corpus")) as CorpusValue;
  if (value.kind !== "dataset") throw new Error("expected a stored dataset");
  const annotators = Math.max(1, Number(ctx.config.annotators ?? 2) || 1);
  await ensureUsers(annotators);
  return syncTask(value.datasetId, {
    name: String(ctx.config.task_name ?? "Annotation task"),
    guidelines: String(ctx.config.guidelines_url ?? ""),
    annotation_level: String(ctx.config.annotation_level ?? "word"),
    labels: String(ctx.config.labels ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    annotators,
  });
}

export function bindingFor(host: string | undefined, mode: Mode): Binding {
  if (!host) {
    throw new Error("module manifest has no host contract");
  }
  const byMode = contracts[host];
  if (!byMode) {
    throw new Error(
      `no host binding for contract "${host}" — add one in web/src/runtime/bindings.ts`,
    );
  }
  const binding = byMode[mode];
  if (!binding) {
    throw new Error(`the "${host}" contract has no implementation for ${mode} platforms`);
  }
  return binding;
}
