// The route side of the ML service: who is asking, and which operation.
//
// Each route under server/api/services/ml/ names the service path it calls.
// There is no catch-all forwarding: an operation nobody wrote a file for does
// not exist, and the /api catch-all answers it with a JSON 404.

import { join } from "node:path";
import type { H3Event } from "h3";
import { forwardToMl, MlFailure, ML_NOT_RUNNING } from "../ml/forward";
import { mlSecret } from "../ml/secret";

/** Where the signing secret lives: its own volume in an export, data/ otherwise. */
function secretPath(): string {
  return process.env["LEGAL_BLOCKS_ML_SECRET_FILE"] || join(dataDir(), "ml-secret");
}

export async function forwardMlOperation(event: H3Event, servicePath: string) {
  const method = event.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const search = event.path.includes("?") ? event.path.slice(event.path.indexOf("?") + 1) : "";
  return callMl(event, servicePath, {
    method,
    query: search,
    contentType: getRequestHeader(event, "content-type"),
    contentLength: getRequestHeader(event, "content-length"),
    body: hasBody ? getRequestWebStream(event) : undefined,
  });
}

/**
 * Uploads a table the platform built itself, such as a Documents dataset, as
 * the person asking. The service sees it exactly as it would a file upload.
 */
export async function uploadToMl(event: H3Event, servicePath: string, form: FormData) {
  const encoded = new Request("http://platform.invalid", { method: "POST", body: form });
  return callMl(event, servicePath, {
    method: "POST",
    query: "",
    contentType: encoded.headers.get("content-type") ?? undefined,
    body: encoded.body,
  });
}

async function callMl(
  event: H3Event,
  servicePath: string,
  request: {
    method: string;
    query: string;
    contentType?: string;
    contentLength?: string;
    body?: BodyInit | null;
  },
) {
  // From the environment at request time: the compose file sets it, and a
  // runtimeConfig default would have been fixed when the image was built.
  const base = process.env["LEGAL_BLOCKS_ML_URL"];
  if (!base) throw fail(event, 503, ML_NOT_RUNNING);

  try {
    const answer = await forwardToMl({
      ...request,
      base,
      path: servicePath,
      ownerId: currentUser(event).id,
      secret: mlSecret(secretPath()),
    });
    setResponseStatus(event, answer.status);
    setResponseHeader(event, "content-type", answer.contentType);
    return answer.body ?? "";
  } catch (e) {
    if (e instanceof MlFailure) throw fail(event, e.status, e.message);
    throw e;
  }
}

/** A path segment the service gets as part of its own path, so nothing but an id. */
export function mlIdParam(event: H3Event, name: string): string {
  const raw = getRouterParam(event, name) ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(raw)) throw fail(event, 400, `invalid ${name} "${raw}"`);
  return raw;
}
