import { createLegalDocsClient } from "node-legal-docs-client";

/**
 * Runs one query against one dataset.
 *
 * A *named operation*, not a path the caller chooses. This service holds the
 * platform's access token, and an earlier version of it forwarded
 * /api/proxy/legal-docs/<anything> upstream — which kept the token off the page
 * and still let any script on that page call any endpoint of the API as the
 * platform's owner. A credential the page cannot read but can still spend is
 * only half a fix.
 *
 * So the dataset is a value from a fixed set and there is no path here for a
 * caller to name. If this ever becomes a [...path].ts, that fix is undone.
 */
export default defineEventHandler(async (event) => {
  const up = requireUpstream(event, "legal-docs");
  const body = await readBody<{ dataset?: string; params?: Record<string, unknown> }>(event);
  const client = createLegalDocsClient({ apiKey: up.token, baseURL: up.baseUrl });

  const params = (body.params ?? {}) as never;
  try {
    switch (body.dataset ?? "RS") {
      case "RS":
        // Statistics come from a second endpoint that takes the graph back;
        // the client makes that call and folds each node's figures into it,
        // which is what the citation viewer colours and clusters by.
        return await client.fetchRechtspraak(params, true);
      case "ECHR":
        return await client.fetchEchr(params, true);
      default:
        // CJEU is offered by the query builder and not by the API yet, so
        // somebody picking it deserves to be told rather than to see a failure.
        throw fail(
          event,
          400,
          `this platform cannot search "${body.dataset}" — only Dutch (RS) and ECHR case law`,
        );
    }
  } catch (e) {
    throw asUpstreamFailure(event, e);
  }
});
