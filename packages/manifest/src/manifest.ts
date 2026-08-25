// The module contract — the "linking factor" that lets independently
// developed packages be wired together without the composer knowing anything
// about them.
//
// Every module ships a <id>.module.json describing what it renders, what data
// it consumes and produces, and what it needs configured. Those files live in
// this repo's registry/ directory during the proof of concept so the npm
// packages do not all need republishing at once; the format is exactly the one
// they will carry at their own package roots, so moving them later is a file
// move and nothing else.

import type { Kind, ModuleKind, Runtime } from "./kinds.js";
import { worksIn } from "./kinds.js";

/**
 * One named connection point carrying a versioned data type such as
 * "corpus@1". Two ports may be connected when their types are equal, or when
 * an adapter is registered for the pair.
 */
export interface Port {
  name: string;
  type: string;
  required?: boolean;
}

/**
 * One setting the composer renders as a form control and writes into the
 * node's config in pipeline.json.
 *
 * `worksIn` limits a field to the kinds of export it makes sense in. A setting
 * describing one task — its labels, its annotation level — belongs to the
 * composer only in a pipeline, because a workspace has a screen for making
 * tasks. Leave it out for a field that applies to both, such as a deployment
 * URL.
 */
export interface ConfigField {
  key: string;
  label: string;
  /**
   * A "secret" is a credential. It is never written into pipeline.json and
   * never sent to a browser: the export puts it in its own file and the
   * platform keeps it server-side, so a platform can call an API on its users'
   * behalf without handing them the key.
   */
  type: "text" | "number" | "select" | "labelset" | "secret";
  default?: unknown;
  options?: string[];
  help?: string;
  worksIn?: Kind[];
  /**
   * Where the value is obtained — an account page for a token, say. The
   * composer renders it next to the field, because a setting nobody knows how
   * to fill in may as well not exist.
   */
  link?: string;
  linkText?: string;
}

export function isSecret(field: ConfigField): boolean {
  return field.type === "secret";
}

/** Whether a config field is offered for the given kind of export. */
export function appliesIn(field: ConfigField, kind: Kind): boolean {
  return worksIn(field.worksIn, kind);
}

/**
 * Which component to mount for a web module. `package` is the npm package
 * name; `component` is a named export from it.
 */
export interface Entry {
  package: string;
  component: string;
  style?: string;
}

/** An outside API a module's service depends on. */
export interface Upstream {
  /**
   * The id of the service that makes the calls. It must also appear in
   * `services`.
   */
  service: string;
  /** The config field holding the API's address. */
  baseUrlKey: string;
  /** The secret config field holding the credential. */
  tokenKey?: string;
  /**
   * Lets a deployment supply the credential at run time instead of shipping
   * it, and takes precedence over anything in the export.
   */
  envVar?: string;
}

/** One module's complete declaration. */
export interface Manifest {
  id: string;
  name: string;
  description?: string;
  version?: string;
  kind: ModuleKind;
  runtime: Runtime;

  entry?: Entry;

  /**
   * Limits the module to the kinds of export it belongs in. A pure view works
   * in both; a download step only makes sense in a pipeline, where nothing is
   * stored and that is the only way work leaves. Empty means both.
   */
  worksIn?: Kind[];

  inputs?: Port[];
  outputs?: Port[];

  /**
   * The data-access contract the runtime must implement for this module —
   * "AnnotationSource" for legal-annotation-kit, "MetricsSource" for
   * vue-iaa-metrics. The packages were already built this way; the runtime
   * supplies the implementation, backed by the platform's store.
   */
  host?: string;

  /**
   * Service ids this module calls at runtime. The platform mounts only the
   * services a pipeline actually references.
   */
  services?: string[];

  /**
   * Declares that one of this module's services calls an API outside the
   * platform, and where its credentials come from. The platform hands them to
   * that service at startup; the module calls the service and never holds a
   * token. Without this the only way to authenticate from the frontend is to
   * ship the token to it, which is what the package's own documentation
   * suggests and exactly what should be avoided.
   */
  upstream?: Upstream;

  config?: ConfigField[];

  /**
   * The authorisation seam. Nothing reads it yet — it is here so that adding
   * login later is a matter of enforcing a field that already exists in every
   * manifest, rather than changing the format.
   */
  requiredRole?: string;
}

/** Whether the module belongs in the given kind of export. */
export function supportsKind(m: Manifest, kind: Kind): boolean {
  return worksIn(m.worksIn, kind);
}

/**
 * A declared conversion between two port types.
 *
 * The registry uses these only to decide whether a connection is legal; the
 * conversion itself is a pure function in the frontend's adapter registry,
 * keyed by the same from/to pair.
 */
export interface Adapter {
  from: string;
  to: string;
  description?: string;
}

/** The set of modules and adapters available to the composer. */
export interface Registry {
  modules: Record<string, Manifest>;
  adapters: Adapter[];
}

/**
 * Assembles a registry from already-parsed manifests.
 *
 * Separate from reading files on purpose. The Go version coupled loading to a
 * filesystem, which meant the only way to test it was to have one; here the
 * checks live in a pure function that a bundler, a test or a directory read
 * can all call.
 */
export function buildRegistry(manifests: unknown[], adapters: unknown): Registry {
  const registry: Registry = { modules: {}, adapters: [] };

  for (const raw of manifests) {
    const m = raw as Manifest;
    if (!m || typeof m.id !== "string" || m.id === "") {
      throw new Error("a module manifest is missing its id");
    }
    if (registry.modules[m.id]) {
      throw new Error(`duplicate module id "${m.id}"`);
    }
    validateUpstream(m);
    registry.modules[m.id] = m;
  }

  if (!Array.isArray(adapters)) {
    throw new Error("adapters.json must contain an array");
  }
  registry.adapters = adapters as Adapter[];

  return registry;
}

/**
 * Checks that a declared upstream names a service the module actually uses.
 * A credential handed to a service nobody mounts is a token sitting in an
 * export for no reason.
 */
function validateUpstream(m: Manifest): void {
  if (!m.upstream) return;
  if (!m.upstream.service) {
    throw new Error(`${m.id}: upstream does not say which service makes the calls`);
  }
  if (!m.services?.includes(m.upstream.service)) {
    throw new Error(
      `${m.id}: upstream names service "${m.upstream.service}", ` +
        `which this module does not list in "services"`,
    );
  }
}

/**
 * Whether a value of type `from` can feed a port of type `to`, either directly
 * or through a declared adapter.
 */
export function canConnect(reg: Registry, from: string, to: string): boolean {
  if (from === to) return true;
  return reg.adapters.some((a) => a.from === from && a.to === to);
}

/** The registry's module ids in a stable order. */
export function moduleIds(reg: Registry): string[] {
  return Object.keys(reg.modules).sort();
}
