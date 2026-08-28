// Mirrors internal/manifest and internal/pipeline on the Go side. Kept by hand
// rather than generated: the shapes are small and stable, and a generator
// would be more machinery than the proof of concept needs.

export type ModuleKind = "source" | "ui" | "service";

/**
 * What is being built. A property of the export, never of a module — the
 * packages ship a source for each, so the host decides.
 *
 * A pipeline runs start to finish and keeps nothing. A workspace is somewhere
 * people come back to, where they make their own documents, labels and tasks.
 */
export type Kind = "pipeline" | "workspace";

export const KINDS: Kind[] = ["pipeline", "workspace"];
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
  /** Kinds of export this setting applies in. Absent means both. */
  worksIn?: Kind[];
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
  kind: ModuleKind;
  runtime: Runtime;
  entry?: Entry;
  /** Kinds of export this module belongs in. Absent means both. */
  worksIn?: Kind[];
  inputs?: Port[];
  outputs?: Port[];
  host?: string;
  services?: string[];
  upstream?: Upstream;
  config?: ConfigField[];
  /** A name from the shared icon vocabulary. See packages/manifest. */
  icon?: string;
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

export interface Pipeline {
  version: number;
  name: string;
  /** Absent means workspace, matching files written before this field existed. */
  kind?: Kind;
  /** The steps, in the order they run. The order is the wiring. */
  nodes: Node[];
}

export function exportKind(p: Pipeline): Kind {
  return p.kind ?? "workspace";
}

/** Whether a module belongs in the given kind of export. */
export function supportsKind(m: Manifest, kind: Kind): boolean {
  return !m.worksIn || m.worksIn.length === 0 || m.worksIn.includes(kind);
}

/**
 * Whether somebody in `role` may use this module.
 *
 * Only asked in a workspace. A pipeline has no accounts — its "annotators" are
 * positions somebody switches between to produce two passes over the same
 * documents — so there is nobody for a role to belong to, and everyone running
 * one is the person who built it.
 */
export function allowsRole(m: Manifest, role: string): boolean {
  if (!m.requiredRole) return true;
  const rank: Record<string, number> = { annotator: 0, editor: 1, admin: 2 };
  return (rank[role] ?? 0) >= (rank[m.requiredRole] ?? 0);
}

/** Whether a setting is offered for the given kind. */
export function fieldAppliesIn(f: ConfigField, kind: Kind): boolean {
  return !f.worksIn || f.worksIn.length === 0 || f.worksIn.includes(kind);
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


export function inputPort(m: Manifest, name: string): Port | undefined {
  return m.inputs?.find((p) => p.name === name);
}

/** Config with manifest defaults filled in for anything the node omits. */
export function configWithDefaults(
  m: Manifest,
  node: Node,
  kind: Kind = "workspace",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of m.config ?? []) {
    if (!fieldAppliesIn(field, kind)) continue;
    out[field.key] = node.config?.[field.key] ?? field.default;
  }
  return out;
}
