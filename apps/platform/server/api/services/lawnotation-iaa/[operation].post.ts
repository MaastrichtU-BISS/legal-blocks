/**
 * The agreement service, which runs as its own container.
 *
 * It stays in Go because it is 1,500 lines of agreement statistics that
 * already exist and work — the one backend Node cannot simply import.
 *
 * The operation is checked against a fixed set rather than forwarded. This
 * service holds no credential, so a loose path here would not leak one, but
 * "the browser names an operation, not a URL" is the rule this codebase keeps
 * and there is no reason to make an exception nobody would remember.
 */
const OPERATIONS = new Set(["metrics", "report.zip"]);

export default defineEventHandler(async (event) => {
  const operation = getRouterParam(event, "operation") ?? "";
  if (!OPERATIONS.has(operation)) {
    throw fail(event, 404, `the agreement service has no operation "${operation}"`);
  }

  const base = useRuntimeConfig().iaaUrl;
  if (!base) {
    throw fail(
      event,
      503,
      "the agreement service is not running. It is a separate container — check " +
        "that it started alongside the platform.",
    );
  }

  const query = new URLSearchParams(getQuery(event) as Record<string, string>).toString();
  const upstream = await fetch(`${base}/${operation}?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await readBody(event)),
  });

  if (!upstream.ok) {
    throw fail(event, 502, `the agreement service failed: ${await upstream.text()}`);
  }
  // report.zip is a zip; metrics is JSON. Passing the type through means this
  // does not have to know which.
  setResponseHeader(event, "content-type", upstream.headers.get("content-type") ?? "application/json");
  return upstream.body;
});
