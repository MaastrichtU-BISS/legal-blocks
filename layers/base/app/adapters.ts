// Conversions between port types.
//
// These are what let modules written without knowledge of each other be
// connected, and registry/adapters.json declares which pairs are legal so the
// composer can allow the connection.
//
// There are none at the moment, and that is the honest state rather than a gap.
//
// There used to be document-set@1 -> corpus@1, letting search feed an
// annotation step directly. It worked by taking each result's `summary` — a
// paragraph the API writes about a case — and presenting it as the document's
// text. A pipeline built on it looked right and annotated the wrong thing.
//
// Getting from a search result to a document worth annotating means fetching
// the judgment, and fetching is work: a second call per case, then parsing,
// perhaps summarising. That is a step a user should see and choose, not a
// silent conversion on an edge. It belongs to the preprocessing module, which
// will take document-set@1 and produce corpus@1 by actually doing it.
//
// So the rule this leaves behind: an adapter may restate what a value is, and
// may drop what the receiving side has no use for. If it has to go and get
// something, it is a module.

type Adapt = (value: unknown) => unknown;

const adapters: Record<string, Adapt> = {};

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
