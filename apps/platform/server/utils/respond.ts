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
