// Conversions between port types.
//
// These are what let modules written without knowledge of each other be
// connected, and registry/adapters.json declares which pairs are legal so the
// composer can allow the connection.
//
// With a shared database, a port carries a reference rather than a payload, so
// a conversion is usually a statement about what the referenced rows may be
// used for rather than a transformation of data. That is still a real claim —
// it is what makes "search results can be annotated" true — but it means most
// adapters do no work, and the ones that do should be looked at twice.

type Adapt = (value: unknown) => unknown;

const adapters: Record<string, Adapt> = {
  // Search results and a corpus are both documents, and that is where the
  // resemblance stops: a result is a case with dates, a court, domains and
  // citations, while a corpus is text with a name on it.
  //
  // This is the one adapter that does real work, and it loses information on
  // purpose — an annotation step has no use for a citation graph. Doing it
  // here rather than in the search step is what lets the viewer, which is not
  // downstream of this conversion, still see the whole case.
  "document-set@1->corpus@1": (value) => {
    const v = value as { kind?: string; nodes?: { id: string; data: Record<string, unknown> }[] };
    if (v.kind !== "results") return value;
    return { kind: "documents", documents: toDocuments(v.nodes ?? []) };
  },
};

/** Maps search results to documents with usable text. */
export function toDocuments(
  nodes: { id: string; data: Record<string, unknown> }[],
): { name: string; full_text: string }[] {
  // A search returns what matched alongside the cases those cite, so that a
  // graph can be drawn. Only the matches are documents somebody meant to work
  // on; annotating a case that merely got cited is not what was asked for.
  const matched = nodes.filter((n) => n.data?.isResult === "True");
  const wanted = matched.length > 0 ? matched : nodes;

  const out: { name: string; full_text: string }[] = [];
  for (const node of wanted) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const textField = ["full_text", "fullText", "text", "summary"].find(
      (k) => typeof data[k] === "string" && (data[k] as string).trim() !== "",
    );
    if (!textField) continue;
    const nameField = ["ecli", "title", "docname", "name"].find(
      (k) => typeof data[k] === "string" && (data[k] as string).trim() !== "",
    );
    out.push({
      name: String(nameField ? data[nameField] : node.id),
      full_text: data[textField] as string,
    });
  }
  return out;
}

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
