// Mirrors internal/manifest and internal/pipeline on the Go side. Kept by hand
// rather than generated: the shapes are small and stable, and a generator
// would be more machinery than the proof of concept needs.

export type Kind = "source" | "ui" | "service";
export type Runtime = "web" | "go-inproc" | "container";

export interface Port {
  name: string;
  type: string;
  required?: boolean;
}

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "labelset";
  default?: unknown;
  options?: string[];
  help?: string;
}

export interface Entry {
  package: string;
  component: string;
  style?: string;
}

export interface Manifest {
  id: string;
  name: string;
  description: string;
  version: string;
  kind: Kind;
  runtime: Runtime;
  entry?: Entry;
  inputs?: Port[];
  outputs?: Port[];
  host?: string;
  services?: string[];
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
  nodes: Node[];
  edges: Edge[];
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
export function configWithDefaults(m: Manifest, node: Node): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of m.config ?? []) {
    out[field.key] = node.config?.[field.key] ?? field.default;
  }
  return out;
}
