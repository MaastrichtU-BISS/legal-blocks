// Credentials, kept apart from the pipeline itself throughout.
//
// pipeline.json describes what a platform is and is meant to be readable,
// shareable and checked into a repository; these are the one thing in an
// export that has to be handled carefully. Mixing them would mean neither
// could be treated simply.

import type { Registry } from "./manifest.js";
import { isSecret } from "./manifest.js";
import type { Pipeline } from "./pipeline.js";

/** Credentials a platform needs, keyed by node id and then by config key. */
export type Secrets = Record<string, Record<string, string>>;

/**
 * The pipeline with every secret config value removed, and those values
 * separately.
 *
 * The stripped copy is what gets written to pipeline.json and what the
 * platform serves to the browser, so a credential cannot reach a page by being
 * carried along inside the pipeline that describes the page.
 */
export function splitSecrets(p: Pipeline, reg: Registry): { clean: Pipeline; secrets: Secrets } {
  const secrets: Secrets = {};

  const nodes = p.nodes.map((node) => {
    const m = reg.modules[node.module];
    if (!m || !node.config) return node;

    let config: Record<string, unknown> | undefined;
    for (const field of m.config ?? []) {
      if (!isSecret(field)) continue;
      if (!(field.key in node.config)) continue;

      if (!config) {
        // Copy lazily: a node with no secrets keeps its original object.
        config = { ...node.config };
      }
      const value = config[field.key];
      delete config[field.key];

      if (typeof value === "string" && value !== "") {
        (secrets[node.id] ??= {})[field.key] = value;
      }
    }
    return config ? { ...node, config } : node;
  });

  return { clean: { ...p, nodes }, secrets };
}

/** One outside API a service calls on a module's behalf. */
export interface ResolvedUpstream {
  /** The id of the service that makes the calls. */
  service: string;
  /** The API to call. */
  baseUrl: string;
  /** Authenticates the platform to it, if there is one. */
  token: string;
  /** Can supply the token at run time instead. */
  envVar?: string;
}

/**
 * The outside APIs this pipeline's services call, with their credentials
 * resolved from secrets.
 */
export function upstreams(p: Pipeline, reg: Registry, secrets: Secrets): ResolvedUpstream[] {
  const out: ResolvedUpstream[] = [];

  for (const node of p.nodes) {
    const m = reg.modules[node.module];
    if (!m?.upstream) continue;

    let baseUrl = "";
    const configured = node.config?.[m.upstream.baseUrlKey];
    if (typeof configured === "string") baseUrl = configured;
    if (baseUrl === "") {
      // Fall back to the manifest's default, so a node that never had its
      // address edited still reaches the hosted service.
      const field = m.config?.find((f) => f.key === m.upstream?.baseUrlKey);
      if (typeof field?.default === "string") baseUrl = field.default;
    }

    const token = m.upstream.tokenKey ? (secrets[node.id]?.[m.upstream.tokenKey] ?? "") : "";

    const resolved: ResolvedUpstream = { service: m.upstream.service, baseUrl, token };
    if (m.upstream.envVar) resolved.envVar = m.upstream.envVar;
    out.push(resolved);
  }

  return out;
}
