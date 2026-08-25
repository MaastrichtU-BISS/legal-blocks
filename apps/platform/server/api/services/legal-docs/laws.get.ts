import { createLegalDocsClient } from "node-legal-docs-client";

/** Searches legislation, for the query builder's law selector. */
export default defineEventHandler(async (event) => {
  const q = String(getQuery(event)["q"] ?? "");
  // An empty search is the state the selector starts in, not a mistake.
  if (q === "") return [];

  const up = requireUpstream(event, "legal-docs");
  const client = createLegalDocsClient({ apiKey: up.token, baseURL: up.baseUrl });
  try {
    return await client.fetchLaws(q);
  } catch (e) {
    throw asUpstreamFailure(event, e);
  }
});
