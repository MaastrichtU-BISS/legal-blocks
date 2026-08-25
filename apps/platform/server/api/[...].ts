/**
 * Anything under /api that no route claimed.
 *
 * Without this an unknown API path falls through to the single-page handler
 * and comes back 200 with index.html — an endpoint that does not exist
 * answering successfully, in HTML, to a caller expecting JSON. That cost real
 * debugging time in the Go implementation and again here, so it is worth the
 * six lines.
 */
export default defineEventHandler((event) => {
  const reason = useDb()
    ? `no such endpoint: ${event.path}`
    : `this platform stores nothing, so ${event.path} does not exist here`;
  throw fail(event, useDb() ? 404 : 501, reason);
});
