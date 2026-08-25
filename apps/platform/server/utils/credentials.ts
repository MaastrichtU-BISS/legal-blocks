// Where a service's outside credentials come from.
//
// Separate from pipeline.json on purpose. The pipeline describes what a
// platform is, is served to every browser that opens it, and should be safe to
// read, copy and commit; credentials.json is the one thing in an export that
// is not. Having that be a single named file is what makes the rule sayable in
// one sentence to whoever receives the zip.
//
// Nothing here is ever returned to a browser. The token reaches an upstream
// API and nowhere else.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { upstreams, type ResolvedUpstream, type Secrets } from "@legal-blocks/manifest";
import { registry } from "../../../../layers/base/server-registry";

let cache: Map<string, ResolvedUpstream> | null = null;

/**
 * The upstream a service calls, with its address and token resolved.
 *
 * An environment variable wins over anything shipped in the export, so a
 * deployment can supply its own key without editing a file it received.
 */
export function upstreamFor(service: string): ResolvedUpstream | undefined {
  if (!cache) {
    cache = new Map();
    for (const up of upstreams(usePipeline(), registry, readSecrets())) {
      const fromEnv = up.envVar ? process.env[up.envVar] : undefined;
      cache.set(up.service, fromEnv ? { ...up, token: fromEnv } : up);
    }
  }
  return cache.get(service);
}

/**
 * The upstream, or a 503 saying what is missing and who can fix it.
 *
 * An empty token is treated as no configuration rather than passed along. The
 * API would refuse the call anyway, and its 401 reads as an expired key —
 * which sends whoever is searching looking for a token they were never given.
 */
export function requireUpstream(event: Parameters<typeof fail>[0], service: string) {
  const up = upstreamFor(service);
  if (!up?.token) {
    throw fail(
      event,
      503,
      "this platform has no access token for the document service, so it cannot " +
        "search. Whoever exported it can add one, or set CITATIONS_API_KEY before " +
        "starting it.",
    );
  }
  return up;
}

function readSecrets(): Secrets {
  const path = join(resolve(process.env["LEGAL_BLOCKS_DIR"] || "."), "credentials.json");
  // A missing file is normal: a platform whose modules need no outside API has
  // none, and a deployment may prefer the environment instead.
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Secrets;
  } catch (e) {
    throw new Error(`reading credentials.json: ${e instanceof Error ? e.message : String(e)}`);
  }
}
