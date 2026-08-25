import type { H3Event } from "h3";

/**
 * A failure the frontend can show.
 *
 * layers/base/app/api.ts reads `error` out of the body and puts it in front of
 * the user, so the wording here is what somebody sees when something goes
 * wrong. Nitro's own error body is {statusCode, statusMessage, message, ...},
 * which would leave every failure showing a bare status line — so
 * server/error.ts reshapes it, and this carries the message in statusMessage
 * for it to find.
 *
 * Thrown rather than returned: it has to short-circuit from inside helpers
 * like requireDb, not just from a handler's last line.
 */
export function fail(_event: H3Event, status: number, message: string) {
  return createError({ statusCode: status, statusMessage: message });
}

/** Parses a path segment that has to be a row id. */
export function idParam(event: H3Event, name: string): number {
  const raw = getRouterParam(event, name);
  const id = Number(raw);
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw fail(event, 400, `invalid ${name} "${raw}"`);
  }
  return id;
}

/**
 * Translates a failure from an outside API into something a person reading it
 * in a browser can act on.
 *
 * The API's own wording is useful when it says which filter was wrong, and
 * actively misleading when it talks about keys — the person searching cannot
 * fix that and should not be sent looking for a token they were never given.
 */
export function asUpstreamFailure(event: H3Event, e: unknown) {
  const status = (e as { response?: { status?: number } })?.response?.status;
  const detail = e instanceof Error ? e.message : String(e);

  if (status === 401 || status === 403) {
    console.error("legal-docs: the access token was refused", status);
    return fail(
      event,
      502,
      "the document service refused this platform's access token — it may have " +
        "expired. Whoever exported this platform can issue a new one.",
    );
  }
  if (status && status < 500) {
    return fail(event, 400, `the document service rejected this search: ${detail}`);
  }
  console.error("legal-docs:", e);
  return fail(
    event,
    502,
    status
      ? "the document service is having trouble — try again in a moment"
      : "could not reach the document service — check this machine's internet connection",
  );
}
