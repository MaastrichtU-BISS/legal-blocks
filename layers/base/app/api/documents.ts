// Finding documents elsewhere, and reading the ones somebody uploads.
//
// Both go through this platform rather than straight from the browser: the
// search service holds the access token, and the import service normalises
// what it reads so offsets mean the same thing whatever the file was.

import { json, post } from "./http";

//
// Case law search happens on this platform's server, in the legal-docs service.
// That is where the access token is, and it is also why these are two named
// operations rather than a client: the page asks for a search, not for a URL,
// so nothing here can point the platform's credential at another endpoint.

/** Runs one query against one dataset. */
export async function searchDocuments(
  query: unknown,
): Promise<{ nodes?: unknown[]; edges?: unknown[] }> {
  return post("/api/services/legal-docs/search", query, "searching for documents");
}

/** Searches legislation, for the query builder's law selector. */
export async function searchLaws(query: string): Promise<unknown[]> {
  const path = `/api/services/legal-docs/laws?q=${encodeURIComponent(query)}`;
  return json(await fetch(path), "searching legislation");
}

//
// The page reads plain text itself; everything else goes to the platform's own
// parser, which has real libraries for PDF, Word and HTML behind it. Shipping
// those to every visitor would be a lot of JavaScript to solve a problem the
// server solves once.

/** What this build can parse, for the file picker's accept list. */
export async function importFormats(): Promise<string[]> {
  const res = await fetch("/api/services/docs-import/formats");
  const body = (await json(res, "asking what can be imported")) as { extensions?: string[] };
  return body.extensions ?? [];
}

/** One file's text, parsed on the server. */
export async function parseDocument(
  file: File,
): Promise<{ text: string; metadata?: Record<string, unknown> }> {
  const body = new FormData();
  body.append("files", file);
  const res = await fetch("/api/services/docs-import/import", { method: "POST", body });
  const result = (await json(res, `reading ${file.name}`)) as {
    documents?: { full_text: string; metadata?: Record<string, unknown> }[];
    skipped?: { reason: string }[];
  };
  const doc = result.documents?.[0];
  if (!doc) {
    // The importer answers with a reason per file; passing it straight through
    // is what lets the component tell somebody why their file was skipped.
    throw new Error(result.skipped?.[0]?.reason ?? "this file could not be read");
  }
  return { text: doc.full_text, metadata: doc.metadata };
}

/** Stores uploaded documents as a new dataset. */
export async function createDataset(
  name: string,
  documents: { name: string; source: string; full_text: string }[],
): Promise<number> {
  const body = await post<{ id: number }>(
    "/api/datasets",
    { name, documents },
    "saving these documents",
  );
  return body.id;
}
