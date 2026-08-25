/**
 * Anything under /api the composer does not serve.
 *
 * It designs platforms and runs none, so most of what a platform answers is
 * genuinely absent here rather than missing — and saying which is more useful
 * than a bare 404.
 */
export default defineEventHandler((event) => {
  throw createError({
    statusCode: 404,
    statusMessage: `the composer designs platforms and runs none, so ${event.path} exists only in an export`,
  });
});
