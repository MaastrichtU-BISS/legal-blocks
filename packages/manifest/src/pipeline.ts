// What a composed platform *is*: a list of module instances and the
// connections between them. A pipeline.json plus the platform image is the
// entire exported product, which is why nothing here is specific to any one
// module.

import type { Kind } from "./kinds.js";
import type { Manifest, Port, Registry } from "./manifest.js";
import { canConnect, supportsKind } from "./manifest.js";

/**
 * One instance of a module in a pipeline. Two annotate steps in the same
 * pipeline are two nodes sharing a module.
 */
export interface Node {
  id: string;
  module: string;
  label?: string;
  config?: Record<string, unknown>;
}

/** One port on one node. */
export interface Endpoint {
  node: string;
  port: string;
}

export function endpointName(e: Endpoint): string {
  return `${e.node}.${e.port}`;
}

/** Connects an output port to an input port. */
export interface Edge {
  from: Endpoint;
  to: Endpoint;
}

/** The exported platform's definition. */
export interface Pipeline {
  version: number;
  name: string;
  /**
   * What this is: a pipeline that runs start to finish and keeps nothing, or a
   * workspace people come back to. A property of the export rather than of any
   * module — the same annotation component is a step in a one-off pass over
   * search results or a durable multi-annotator task, depending only on which
   * source the platform builds for it.
   *
   * Absent means workspace, so a file written before this field existed keeps
   * the behaviour it had.
   */
  kind?: Kind;
  nodes: Node[];
  edges: Edge[];
}

/** What this is, defaulting to a workspace. */
export function exportKind(p: Pipeline): Kind {
  return p.kind ?? "workspace";
}

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Reads and validates a pipeline against a registry.
 *
 * Throws with the message the user should see: these are read by whoever is
 * composing, and "cannot connect a to b" is the whole feedback loop.
 */
export function parsePipeline(raw: unknown, reg: Registry): Pipeline {
  const p = (typeof raw === "string" ? JSON.parse(raw) : raw) as Pipeline;
  validatePipeline(p, reg);
  return p;
}

/**
 * Checks that every node names a known module, every edge connects ports that
 * exist and carry compatible types, and every required input is connected.
 *
 * This is the same check the composer applies when the user draws a
 * connection, so an exported pipeline cannot be one the composer would have
 * rejected.
 */
export function validatePipeline(p: Pipeline, reg: Registry): void {
  if (!p || !Array.isArray(p.nodes) || p.nodes.length === 0) {
    throw new Error("pipeline has no nodes");
  }
  if (!Array.isArray(p.edges)) {
    throw new Error("pipeline has no edges list");
  }

  const kind = exportKind(p);
  if (kind !== "pipeline" && kind !== "workspace") {
    throw new Error(`unknown kind "${kind}" — expected pipeline or workspace`);
  }

  const byId = new Map<string, Node>();
  for (const n of p.nodes) {
    if (!ID_PATTERN.test(n.id ?? "")) {
      throw new Error(`node id "${n.id}" must be alphanumeric, dash or underscore`);
    }
    if (byId.has(n.id)) {
      throw new Error(`duplicate node id "${n.id}"`);
    }
    const m = reg.modules[n.module];
    if (!m) {
      throw new Error(`node "${n.id}" references unknown module "${n.module}"`);
    }
    // A module that needs stored resources has no meaning in a pipeline, and
    // vice versa. Catching it here means an export cannot promise a screen
    // that will not function.
    if (!supportsKind(m, kind)) {
      throw new Error(`module "${n.module}" does not belong in a ${kind}`);
    }
    byId.set(n.id, n);
  }

  // Every edge must land on ports that exist and carry compatible types.
  const connected = new Set<string>();
  for (const e of p.edges) {
    const fromNode = byId.get(e.from?.node ?? "");
    if (!fromNode) {
      throw new Error(`edge from unknown node "${e.from?.node}"`);
    }
    const toNode = byId.get(e.to?.node ?? "");
    if (!toNode) {
      throw new Error(`edge to unknown node "${e.to?.node}"`);
    }
    const out = findPort(reg.modules[fromNode.module]?.outputs, e.from.port);
    if (!out) {
      throw new Error(`module "${fromNode.module}" has no output port "${e.from.port}"`);
    }
    const into = findPort(reg.modules[toNode.module]?.inputs, e.to.port);
    if (!into) {
      throw new Error(`module "${toNode.module}" has no input port "${e.to.port}"`);
    }
    if (!canConnect(reg, out.type, into.type)) {
      throw new Error(
        `cannot connect ${endpointName(e.from)} (${out.type}) to ` +
          `${endpointName(e.to)} (${into.type}): ${whyNot(out.type, into.type)}`,
      );
    }
    const key = endpointName(e.to);
    if (connected.has(key)) {
      throw new Error(`input ${key} is connected more than once`);
    }
    connected.add(key);
  }

  // Required inputs are only required in a pipeline.
  //
  // That is where an edge is how data reaches a step: a search feeds a viewer,
  // an upload feeds an annotator, and a step with nothing connected has
  // nothing to work on. In a workspace none of that is true. Documents become
  // datasets, a task names the dataset and labelset it uses, and the annotate
  // tool is opened against a task somebody chose — so the corpus arrives from
  // the workspace, not from whatever happens to be upstream.
  //
  // Insisting on an edge there would mean drawing one that lies: connecting
  // upload to annotate would say "these documents" when the real answer is
  // "whichever dataset the task names". Edges that are present are still
  // type-checked above; they just stop being compulsory.
  if (kind === "pipeline") {
    for (const n of p.nodes) {
      for (const input of reg.modules[n.module]?.inputs ?? []) {
        if (input.required && !connected.has(`${n.id}.${input.name}`)) {
          throw new Error(`node "${n.id}" has no connection for required input "${input.name}"`);
        }
      }
    }
  }

  checkAcyclic(p);
}

/**
 * Rejects cycles. The composer only builds linear chains today, but the model
 * is a graph and an exported pipeline.json can be hand-edited, so the runtime
 * must not be able to loop forever resolving inputs.
 */
function checkAcyclic(p: Pipeline): void {
  const deps = dependencies(p);
  const state = new Map<string, "visiting" | "done">();

  const walk = (id: string): void => {
    const seen = state.get(id);
    if (seen === "done") return;
    if (seen === "visiting") {
      throw new Error(`pipeline contains a cycle through node "${id}"`);
    }
    state.set(id, "visiting");
    for (const dep of deps.get(id) ?? []) walk(dep);
    state.set(id, "done");
  };

  for (const n of p.nodes) walk(n.id);
}

/**
 * Node ids in dependency order — every node after the nodes feeding it. The
 * runtime uses this to lay out the step navigation.
 */
export function order(p: Pipeline): string[] {
  const deps = dependencies(p);
  const out: string[] = [];
  const seen = new Set<string>();

  const walk = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const dep of deps.get(id) ?? []) walk(dep);
    out.push(id);
  };

  for (const n of p.nodes) walk(n.id);
  return out;
}

function dependencies(p: Pipeline): Map<string, string[]> {
  const deps = new Map<string, string[]>();
  for (const e of p.edges) {
    const list = deps.get(e.to.node) ?? [];
    list.push(e.from.node);
    deps.set(e.to.node, list);
  }
  return deps;
}

/**
 * The services the pipeline's modules require, so the platform mounts only
 * what is actually used.
 */
export function serviceIds(p: Pipeline, reg: Registry): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of p.nodes) {
    for (const s of reg.modules[n.module]?.services ?? []) {
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }
  return out;
}

/**
 * Explains a refused connection.
 *
 * The generic answer is true but unhelpful — someone wiring a search into an
 * annotation step has a reasonable idea and is missing a piece, and saying
 * which piece is the difference between a dead end and a next step.
 */
function whyNot(from: string, to: string): string {
  if (from === "document-set@1" && to === "corpus@1") {
    return (
      "search results are cases, not documents to work on. Getting their text " +
      "means fetching each judgment, which is a preprocessing step rather than " +
      "something that can happen on this connection"
    );
  }
  return "no adapter declared";
}

function findPort(ports: Port[] | undefined, name: string): Port | undefined {
  return ports?.find((p) => p.name.toLowerCase() === name?.toLowerCase());
}

/** The manifest for a node, or undefined if the registry does not have it. */
export function moduleOf(p: Pipeline, reg: Registry, nodeId: string): Manifest | undefined {
  const node = p.nodes.find((n) => n.id === nodeId);
  return node ? reg.modules[node.module] : undefined;
}
