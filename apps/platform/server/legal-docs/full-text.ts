// Fetching the full text of judgments a search found.
//
// Kept free of Nitro so it can be tested with a stand-in client. The route
// (server/api/services/legal-docs/text.post.ts) only reads the request and
// finds the token.

import type { LegalDocsClient } from "node-legal-docs-client";

/** At most this many judgments per request, so one call cannot run for minutes. */
export const MAX_ECLIS_PER_REQUEST = 25;

export interface FullTextRequest {
  ecli: string;
  /** "ECHR" when the search said so; otherwise the ECLI decides. */
  dataset?: string;
}

export interface FullText {
  ecli: string;
  text: string | null;
  /** Why there is no text, in the service's words, when there is none. */
  message?: string;
}

export function isEchr(request: FullTextRequest): boolean {
  return request.dataset === "ECHR" || request.ecli.toUpperCase().startsWith("ECLI:CE:ECHR:");
}

/**
 * The full text of each judgment, in the order asked for. Dutch judgments come
 * from Rechtspraak, ECHR ones from HUDOC, in one call each.
 */
export async function fetchFullTexts(
  client: Pick<LegalDocsClient, "getRechtspraakFullText" | "getEchrFullText">,
  requests: FullTextRequest[],
): Promise<FullText[]> {
  const echr = requests.filter(isEchr).map((r) => r.ecli);
  const dutch = requests.filter((r) => !isEchr(r)).map((r) => r.ecli);

  const [fromDutch, fromEchr] = await Promise.all([
    dutch.length ? client.getRechtspraakFullText(dutch) : Promise.resolve([]),
    echr.length ? client.getEchrFullText(echr) : Promise.resolve([]),
  ]);

  const byEcli = new Map<string, FullText>();
  for (const doc of [...fromDutch, ...fromEchr]) {
    const text = doc.fullTextAvailable && doc.fullText?.trim() ? doc.fullText : null;
    byEcli.set(doc.ecli, { ecli: doc.ecli, text, message: text ? undefined : doc.message });
  }
  return requests.map(
    (r) => byEcli.get(r.ecli) ?? { ecli: r.ecli, text: null, message: "The service returned nothing for it." },
  );
}
