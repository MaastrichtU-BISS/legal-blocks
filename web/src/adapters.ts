// Conversions between port types.
//
// These are what let modules written without knowledge of each other be
// connected. The query builder emits search results; the annotation kit wants
// documents with text. Neither knows about the other, and neither had to
// change — the conversion lives here, and registry/adapters.json declares that
// it exists so the composer allows the connection.
//
// Adding a conversion is a function here plus an entry in adapters.json.

import type { CorpusDocument } from "./types";

type Adapt = (value: unknown) => unknown;

/** Anything the search modules return: a document with some full-text field. */
interface SearchResult {
  id?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Pulls a readable title and body out of a search result. The two datasets
 * (Rechtspraak, ECHR) shape their documents differently, so this looks for the
 * plausible fields rather than assuming one schema — a search result with no
 * text at all is skipped rather than becoming an empty document to annotate.
 */
function toCorpusDocument(doc: SearchResult, index: number): CorpusDocument | null {
  const data = (doc.data ?? doc) as Record<string, unknown>;

  const textField = ["full_text", "fullText", "text", "summary", "conclusion"].find(
    (k) => typeof data[k] === "string" && (data[k] as string).trim() !== "",
  );
  if (!textField) return null;

  const nameField = ["ecli", "title", "docname", "name", "id"].find(
    (k) => typeof data[k] === "string" && (data[k] as string).trim() !== "",
  );
  const name = nameField ? (data[nameField] as string) : (doc.id ?? `document-${index + 1}`);

  return { name: String(name), full_text: data[textField] as string };
}

const adapters: Record<string, Adapt> = {
  "document-set@1->corpus@1": (value) => {
    const docs = Array.isArray(value) ? (value as SearchResult[]) : [];
    return docs
      .map(toCorpusDocument)
      .filter((d): d is CorpusDocument => d !== null);
  },
};

/**
 * Converts a value produced by a `from` port into one a `to` port accepts.
 * Identical types pass through untouched.
 */
export function adapt(from: string, to: string, value: unknown): unknown {
  if (from === to) return value;
  const fn = adapters[`${from}->${to}`];
  if (!fn) {
    throw new Error(`no adapter from ${from} to ${to}`);
  }
  return fn(value);
}
