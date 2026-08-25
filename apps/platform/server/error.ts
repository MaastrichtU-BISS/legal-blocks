/**
 * Every failure, in the one shape the frontend reads: {"error": "..."}.
 *
 * Without this Nitro answers with its own envelope and the platform shows a
 * bare "Server Error" wherever a message should be — which is most of the
 * value of having written the messages.
 *
 * HTML is deliberately never returned for /api paths. An endpoint answering a
 * JSON caller with a rendered error page is the same failure as answering 200
 * with index.html: it looks like it worked.
 */
export default defineNitroErrorHandler((error, event) => {
  const status = error.statusCode || 500;
  // statusMessage is where fail() puts the wording. Anything unhandled has
  // none, and its message is an internal detail rather than something to show.
  const message =
    error.statusMessage || (status >= 500 ? "something went wrong on the platform" : error.message);

  if (status >= 500) console.error(`${event.path}:`, error);

  setResponseStatus(event, status);
  setResponseHeader(event, "content-type", "application/json");
  return send(event, JSON.stringify({ error: message }));
});
