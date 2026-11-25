// One request to the ML service, on behalf of one person.
//
// Kept free of Nitro so it can be tested against a plain HTTP server. The
// route side (server/utils/ml.ts) only says which operation and who is asking.

import { signMlToken } from "./token";

export const ML_NOT_RUNNING =
  "The ML service is not running. It is a separate container — check that it " +
  "started alongside the platform.";

export interface MlRequest {
  base: string;
  method: string;
  /** The service's own path, e.g. /api/datasets/upload. Never from the browser. */
  path: string;
  /** The query string as the browser sent it, without the "?". */
  query: string;
  ownerId: number;
  secret: string;
  contentType?: string;
  contentLength?: string;
  body?: BodyInit | null;
}

export interface MlResponse {
  status: number;
  contentType: string;
  body: ReadableStream<Uint8Array> | null;
}

/** A failure the platform words itself, rather than passing the service's on. */
export class MlFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Forwards the request and returns the service's answer.
 *
 * Anything below 500 passes through with its status and body: legal-ml-core's
 * 400 says which field was wrong, and its 404 and 409 mean what they say. Only
 * a connection that fails, or the service failing, becomes the platform's own
 * message.
 */
export async function forwardToMl(req: MlRequest, fetchImpl: typeof fetch = fetch): Promise<MlResponse> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${signMlToken(req.ownerId, req.secret)}`,
  };
  if (req.contentType) headers["Content-Type"] = req.contentType;
  if (req.contentLength) headers["Content-Length"] = req.contentLength;

  const url = `${req.base.replace(/\/$/, "")}${req.path}${req.query ? `?${req.query}` : ""}`;
  const started = Date.now();

  let upstream: Response;
  try {
    upstream = await fetchImpl(url, {
      method: req.method,
      headers,
      body: req.body ?? undefined,
      // Uploads are streamed through rather than held in memory.
      ...(req.body ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch (e) {
    console.error(`ml ${req.method} ${req.path}: unreachable:`, e instanceof Error ? e.message : e);
    throw new MlFailure(503, ML_NOT_RUNNING);
  }

  console.info(`ml ${req.method} ${req.path} -> ${upstream.status} in ${Date.now() - started}ms`);

  if (upstream.status >= 500) {
    const detail = await upstream.text().catch(() => "");
    console.error(`ml ${req.method} ${req.path}: ${upstream.status}: ${detail.slice(0, 500)}`);
    if (upstream.status === 503) throw new MlFailure(503, ML_NOT_RUNNING);
    throw new MlFailure(502, "The ML service failed to answer. Try again in a moment.");
  }

  return {
    status: upstream.status,
    contentType: upstream.headers.get("content-type") ?? "application/json",
    body: upstream.body,
  };
}
