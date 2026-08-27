// What a composed platform *is*: an ordered list of module instances. A
// pipeline.json plus the platform image is the entire exported product, which
// is why nothing here is specific to any one module.
//
// The order is the wiring. A pipeline runs its steps front to back and nobody
// can skip one, so step 2 reads what step 1 produced — there is nothing for a
// connection to say that the position does not already say. This used to be a
// graph with an explicit edge list, and the edges only ever described the
// chain the composer had already laid out.

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
  /** The steps, in the order they run. */
  nodes: Node[];
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
  const p = migrate((typeof raw === "string" ? JSON.parse(raw) : raw) as Pipeline);
  validatePipeline(p, reg);
  return p;
}

/**
 * Brings a pipeline written when this was a graph up to the ordered list.
 *
 * An export's compose file invites upgrading in place by changing an image
 * tag, so a pipeline.json written by an older composer will meet a newer
 * platform. Back then the runtime laid steps out in dependency order rather
 * than array order, and the two could differ — so reading such a file means
 * putting the nodes in the order its edges implied, then forgetting them.
 *
 * Anything that is already a list passes through untouched.
 */
function migrate(p: Pipeline): Pipeline {
  const legacy = (p as { edges?: { from?: { node?: string }; to?: { node?: string } }[] }).edges;
  if (!Array.isArray(legacy) || legacy.length === 0 || !Array.isArray(p.nodes)) return p;

  const deps = new Map<string, string[]>();
  for (const e of legacy) {
    const to = e?.to?.node;
    const from = e?.from?.node;
    if (typeof to === "string" && typeof from === "string") {
      deps.set(to, [...(deps.get(to) ?? []), from]);
    }
  }

  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const ordered: Node[] = [];
  const seen = new Set<string>();
  const walk = (id: string): void => {
    // A cycle in a hand-edited legacy file stops here rather than looping: the
    // result is still a list, which is the only shape that can run now.
    if (seen.has(id)) return;
    seen.add(id);
    for (const dep of deps.get(id) ?? []) walk(dep);
    const node = byId.get(id);
    if (node) ordered.push(node);
  };
  for (const n of p.nodes) walk(n.id);

  const { edges: _dropped, ...rest } = p as Pipeline & { edges?: unknown };
  return { ...rest, nodes: ordered };
}

/**
 * Checks that every node names a known module, and that in a pipeline each
 * step's required inputs are satisfied by the step in front of it.
 *
 * This is the same check the composer applies when deciding what may be added
 * next, so an exported pipeline cannot be one the composer would have refused
 * to build.
 */
export function validatePipeline(p: Pipeline, reg: Registry): void {
  if (!p || !Array.isArray(p.nodes) || p.nodes.length === 0) {
    throw new Error("pipeline has no nodes");
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

  // Required inputs are only required in a pipeline.
  //
  // That is where the order is how data reaches a step: a search feeds a
  // viewer, an upload feeds an annotator, and a first step that needs input
  // has nothing to work on. In a workspace none of that is true. Documents
  // become datasets, a task names the dataset and labelset it uses, and the
  // annotate tool is opened against a task somebody chose — so the corpus
  // arrives from the workspace, not from the step before.
  if (kind === "pipeline") {
    p.nodes.forEach((n, i) => {
      for (const input of reg.modules[n.module]?.inputs ?? []) {
        if (!input.required) continue;

        const previous = p.nodes[i - 1];
        if (!previous) {
          throw new Error(
            `step "${n.id}" needs ${input.type} to work on, but it is the first step — ` +
              `put a step that produces ${input.type} in front of it`,
          );
        }
        const supplied = supplies(reg, previous, input);
        if (!supplied) {
          const produced = reg.modules[previous.module]?.outputs?.[0]?.type;
          throw new Error(
            `step "${n.id}" needs ${input.type}, but the step before it ("${previous.id}") ` +
              `produces ${produced ?? "nothing"}: ${whyNot(produced ?? "", input.type)}`,
          );
        }
      }
    });
  }
}

/**
 * The port on `previous` that feeds `input`, if any.
 *
 * The first compatible output wins. A module with several outputs whose types
 * a downstream step could take either of is not something the registry has,
 * and picking the first keeps the rule sayable: a step reads what the step
 * before it produces.
 */
function supplies(reg: Registry, previous: Node, input: Port): Port | undefined {
  return reg.modules[previous.module]?.outputs?.find((out) => canConnect(reg, out.type, input.type));
}

/** Node ids in the order they run, which is the order they are written in. */
export function order(p: Pipeline): string[] {
  return p.nodes.map((n) => n.id);
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

/** The manifest for a node, or undefined if the registry does not have it. */
export function moduleOf(p: Pipeline, reg: Registry, nodeId: string): Manifest | undefined {
  const node = p.nodes.find((n) => n.id === nodeId);
  return node ? reg.modules[node.module] : undefined;
}
