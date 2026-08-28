// The three modules that deal in documents: bringing them in, finding them
// elsewhere, and drawing them.
//
// Together because they share the session stores below. In a pipeline nothing
// is written down, so "what this step produced" has to be held somewhere for
// the next step to read — these maps are that somewhere, and they are the only
// state the runtime keeps.

import { createDataset, importFormats, parseDocument, searchDocuments, searchLaws } from "../../api";
import type { BindingContext, CorpusValue, KindBindings, ResultNode } from "./types";
import { resultsOf } from "./values";

// --- bringing documents in ---------------------------------------------------

/** Uploaded documents held for the session, when nothing is being stored. */
const sessionUploads = new Map<string, { name: string; full_text: string }[]>();

export const DocumentImport: KindBindings = {
  workspace: {
    async props(ctx) {
      return importProps(async (documents) => {
        await createDataset(
          ctx.datasetName ?? String(ctx.config.dataset_name ?? "Documents"),
          documents,
        );
        ctx.refresh();
      });
    },
    async output(): Promise<CorpusValue> {
      // In a platform that stores its work, uploading makes a dataset that
      // tasks are created against — the documents do not travel to one fixed
      // next step.
      return { kind: "documents", documents: [] };
    },
  },

  pipeline: {
    async props(ctx) {
      return importProps(async (documents) => {
        sessionUploads.set(ctx.nodeId, documents);
        ctx.produced();
      });
    },
    async output(ctx): Promise<CorpusValue> {
      return { kind: "documents", documents: sessionUploads.get(ctx.nodeId) ?? [] };
    },
  },
};

/**
 * The import component's props: one reader that sends every file to this
 * platform's parser.
 *
 * Including plain text, which the component could read by itself. Two reasons
 * it should not here. The parser normalises what it reads — LF line endings, no
 * byte order mark — and annotation offsets are character positions, so a .txt
 * read in the page would land differently from the same content inside a .docx
 * read on the server. And a file that cannot be read comes back with a reason
 * written in one place rather than two.
 */
async function importProps(
  keep: (documents: { name: string; source: string; full_text: string }[]) => Promise<void>,
): Promise<Record<string, unknown>> {
  const extensions = await importFormats();
  return {
    readers: [
      {
        extensions,
        label: describeFormats(extensions),
        read: (file: File) => parseDocument(file),
      },
    ],
    onImport: keep,
  };
}

/** Names a set of extensions for the drop zone: "Text, PDF, Word or HTML". */
function describeFormats(extensions: string[]): string {
  const names = new Set<string>();
  for (const ext of extensions) {
    if ([".txt", ".text", ".md"].includes(ext)) names.add("Text");
    else if (ext === ".pdf") names.add("PDF");
    else if (ext === ".docx") names.add("Word");
    else if ([".html", ".htm", ".xhtml"].includes(ext)) names.add("HTML");
    else names.add(ext.replace(".", "").toUpperCase());
  }
  const list = [...names];
  if (list.length < 2) return list[0] ?? "No formats available";
  return `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
}

// --- finding documents elsewhere ---------------------------------------------

/** Search results held for the session, when nothing is being stored. */
const sessionResults = new Map<string, { nodes: ResultNode[]; edges: unknown[] }>();

/**
 * vue-legal-query-builder. Search answers with a citation network and stops
 * there, in both modes. It does not write documents anywhere and does not
 * reduce a case to its text: turning results into something annotatable means
 * fetching each judgment, which is the preprocessing module's job.
 */
export const DocumentSearch: KindBindings = {
  workspace: {
    async props(ctx) {
      return searchProps(ctx, async (result) => {
        sessionResults.set(ctx.nodeId, result);
      });
    },
    async output(ctx): Promise<CorpusValue> {
      return resultValue(ctx.nodeId);
    },
  },

  pipeline: {
    async props(ctx) {
      return searchProps(ctx, async (result) => {
        sessionResults.set(ctx.nodeId, result);
        ctx.produced();
      });
    },
    async output(ctx): Promise<CorpusValue> {
      return resultValue(ctx.nodeId);
    },
  },
};

/** What this search step has found so far, empty before the first search. */
function resultValue(nodeId: string): CorpusValue {
  const result = sessionResults.get(nodeId);
  return { kind: "results", nodes: result?.nodes ?? [], edges: result?.edges ?? [] };
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
  keep: (result: { nodes: ResultNode[]; edges: unknown[] }) => Promise<void>,
): Promise<Record<string, unknown>> {
  return {
    title: ctx.config.title ?? "Find documents",

    onSubmit: async (query: unknown) => {
      const result = await searchDocuments(query);
      await keep({
        nodes: (result.nodes ?? []) as ResultNode[],
        edges: (result.edges ?? []) as unknown[],
      });
      ctx.refresh();
      return result;
    },

    // The law selector looks legislation up as the user types. Without this
    // callback the block says so, rather than appearing to find nothing.
    onSearchLaws: searchLaws,
  };
}

// --- drawing them ------------------------------------------------------------

/**
 * vue-legal-docs-visualizer. A pure view: it renders what it is given and
 * passes the reference on unchanged, so it works identically either way.
 */
export const DocumentPassthrough: KindBindings = {
  workspace: {
    async props(ctx) {
      return visualiserProps((await ctx.input("documents")) as CorpusValue);
    },
    async output(ctx): Promise<CorpusValue> {
      return (await ctx.input("documents")) as CorpusValue;
    },
  },

  pipeline: {
    async props(ctx) {
      return visualiserProps((await ctx.input("documents")) as CorpusValue);
    },
    async output(ctx): Promise<CorpusValue> {
      return (await ctx.input("documents")) as CorpusValue;
    },
  },
};

/** The documents and citations the viewer draws. */
async function visualiserProps(value: CorpusValue): Promise<Record<string, unknown>> {
  return {
    docs: await resultsOf(value),
    edges: value.kind === "results" ? value.edges : [],
  };
}
