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
  // Search results and a corpus are both datasets of documents. The query
  // builder stores what it finds with the text extracted, so an annotation
  // step downstream reads them exactly as it reads the corpus folder. Nothing
  // to convert — the claim is that those documents have usable text, and the
  // storing side is what makes it true.
  "document-set@1->corpus@1": (value) => value,
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
