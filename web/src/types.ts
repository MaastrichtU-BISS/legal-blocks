// Mirrors internal/manifest and internal/pipeline on the Go side. Kept by hand
// rather than generated: the shapes are small and stable, and a generator
// would be more machinery than the proof of concept needs.

export type Kind = "source" | "ui" | "service";

/**
 * Where a platform's data lives. A property of the pipeline, never of a
 * module — the packages ship a source for each, so the host decides.
 */
export type Mode = "ephemeral" | "persistent";

export const MODES: Mode[] = ["ephemeral", "persistent"];
export type Runtime = "web" | "go-inproc" | "container";

export interface Port {
  name: string;
  type: string;
  required?: boolean;
}

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "labelset" | "secret";
  default?: unknown;
  options?: string[];
  help?: string;
  /** Modes this setting applies in. Absent means all of them. */
  modes?: Mode[];
  /** Where the value is obtained — an account page for a token, say. */
  link?: string;
  linkText?: string;
}

export interface Entry {
  package: string;
  component: string;
  style?: string;
}

/** An outside API a module's service calls, with the credentials it needs. */
export interface Upstream {
  service: string;
  baseUrlKey: string;
  tokenKey?: string;
  envVar?: string;
}

export interface Manifest {
  id: string;
  name: string;
  description: string;
  version: string;
  kind: Kind;
  runtime: Runtime;
  entry?: Entry;
  /** Modes this module can work in. Absent means all of them. */
  modes?: Mode[];
  inputs?: Port[];
  outputs?: Port[];
  host?: string;
  services?: string[];
  upstream?: Upstream;
  config?: ConfigField[];
  requiredRole?: string;
}

export interface Adapter {
  from: string;
  to: string;
  description?: string;
}

export interface Registry {
  modules: Record<string, Manifest>;
  adapters: Adapter[];
}

export interface Node {
  id: string;
  module: string;
  label: string;
  config?: Record<string, unknown>;
}

export interface Endpoint {
  node: string;
  port: string;
}

export interface Edge {
  from: Endpoint;
  to: Endpoint;
}

export interface Pipeline {
  version: number;
  name: string;
  /** Absent means persistent, matching pipelines written before modes existed. */
  mode?: Mode;
  nodes: Node[];
  edges: Edge[];
}

export function storageMode(p: Pipeline): Mode {
  return p.mode ?? "persistent";
}

/** Whether a module can be used in the given mode. */
export function supportsMode(m: Manifest, mode: Mode): boolean {
  return !m.modes || m.modes.length === 0 || m.modes.includes(mode);
}

/** Whether a setting is offered in the given mode. */
export function fieldAppliesIn(f: ConfigField, mode: Mode): boolean {
  return !f.modes || f.modes.length === 0 || f.modes.includes(mode);
}

/** One input document, the payload of the corpus@1 port type. */
export interface CorpusDocument {
  name: string;
  full_text: string;
}

/** Whether a value of type `from` can feed a port of type `to`. */
export function canConnect(registry: Registry, from: string, to: string): boolean {
  if (from === to) return true;
  return registry.adapters.some((a) => a.from === from && a.to === to);
}

export function outputPort(m: Manifest, name: string): Port | undefined {
  return m.outputs?.find((p) => p.name === name);
}

export function inputPort(m: Manifest, name: string): Port | undefined {
  return m.inputs?.find((p) => p.name === name);
}

/** Config with manifest defaults filled in for anything the node omits. */
export function configWithDefaults(
  m: Manifest,
  node: Node,
  mode: Mode = "persistent",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of m.config ?? []) {
    if (!fieldAppliesIn(field, mode)) continue;
    out[field.key] = node.config?.[field.key] ?? field.default;
  }
  return out;
}
