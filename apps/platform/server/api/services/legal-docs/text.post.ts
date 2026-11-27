import { createLegalDocsClient } from "node-legal-docs-client";
import { fetchFullTexts, MAX_ECLIS_PER_REQUEST, type FullTextRequest } from "../../../legal-docs/full-text";

/**
 * The full text of judgments a search found, for the Get full text step.
 * Same token and address as search, which is in the same platform.
 */
export default defineEventHandler(async (event) => {
  const up = requireUpstream(event, "legal-docs");
  const body = await readBody<{ documents?: FullTextRequest[] }>(event);
  const requests = (body?.documents ?? []).filter(
    (d): d is FullTextRequest => typeof d?.ecli === "string" && d.ecli.length > 0,
  );
  if (!requests.length) throw fail(event, 400, "no judgments were asked for");
  if (requests.length > MAX_ECLIS_PER_REQUEST) {
    throw fail(event, 400, `at most ${MAX_ECLIS_PER_REQUEST} judgments at a time`);
  }

  const client = createLegalDocsClient({ apiKey: up.token, baseURL: up.baseUrl });
  try {
    return await fetchFullTexts(client, requests);
  } catch (e) {
    throw asUpstreamFailure(event, e);
  }
});
