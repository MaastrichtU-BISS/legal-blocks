// Resolving a step's input from the step in front of it.
//
// A pipeline is an ordered list and nobody can skip a step, so by the time
// step x is on screen step x-1 has run and its output is what x reads. There
// is no graph to search and no "run the pipeline" pass: a step asks for its
// input, and the answer is the previous step's output, adapted if the types
// differ but are compatible.

import { adapt, canAdapt } from "../adapters";
import type { Kind, Pipeline, Registry } from "../types";
import { inputPort, configWithDefaults } from "../types";
import { bindingFor, type BindingContext } from "./bindings";

export interface ResolveEnv {
  pipeline: Pipeline;
  registry: Registry;
  /** Where this platform's data lives. */
  kind: Kind;
  annotator: number;
  /**
   * The task these steps are working on, when one is open.
   *
   * Set by the workspace, which is where a stored platform's tasks are chosen.
   * A session platform has no task list and no id: its task is built from the
   * pipeline's own settings, which is the whole difference between the two.
   */
  taskId?: number;
  /**
   * What a dataset about to be created should be called.
   *
   * Set by the workspace when somebody is uploading, for the same reason
   * taskId is: the module producing the documents has no idea it is making a
   * dataset, let alone what to name it.
   */
  datasetName?: string;
  /**
   * Where in an annotator's queue to open. Set by the workspace when somebody
   * picks a document rather than carrying on from the top.
   */
  startPosition?: number;
  /** Called when a module reports it has nothing left to do. */
  finished?: () => void;
  refresh(): void;
  /**
   * Told when a step has produced its output, so a pipeline can move on to the
   * step that reads it without waiting to be clicked.
   */
  produced(nodeId: string): void;
}

/**
 * Produces the value on `nodeId`'s output port, delegating to the module's
 * host binding.
 */
export async function produce(env: ResolveEnv, nodeId: string, portName: string): Promise<unknown> {
  const node = env.pipeline.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`unknown node "${nodeId}"`);
  const manifest = env.registry.modules[node.module];
  if (!manifest) throw new Error(`unknown module "${node.module}"`);

  return bindingFor(manifest.host, env.kind).output(contextFor(env, nodeId), portName);
}

/**
 * Resolves the value arriving on `nodeId`'s input port: whatever the step
 * before it produces, converted if that port carries a different — but
 * adaptable — type.
 */
async function resolveInput(
  env: ResolveEnv,
  nodeId: string,
  portName: string,
): Promise<unknown> {
  const index = env.pipeline.nodes.findIndex((n) => n.id === nodeId);
  if (index < 0) throw new Error(`unknown node "${nodeId}"`);

  const previous = env.pipeline.nodes[index - 1];
  if (!previous) {
    throw new Error(`step "${nodeId}" is first, so there is nothing in front of it to read`);
  }

  const toType = inputPort(env.registry.modules[env.pipeline.nodes[index]!.module], portName)?.type;
  // The first output whose type this input can take. Validation has already
  // established there is one, in the composer and again when the platform read
  // its pipeline.json, so reaching the throw means a hand-edited file.
  const from = toType
    ? env.registry.modules[previous.module]?.outputs?.find((out) => canAdapt(out.type, toType))
    : undefined;
  if (!from || !toType) {
    throw new Error(
      `step "${previous.id}" produces nothing that step "${nodeId}" can read on "${portName}"`,
    );
  }

  return adapt(from.type, toType, await produce(env, previous.id, from.name));
}

/** The context handed to a binding for one node. */
export function contextFor(env: ResolveEnv, nodeId: string): BindingContext {
  const node = env.pipeline.nodes.find((n) => n.id === nodeId)!;
  const manifest = env.registry.modules[node.module];
  return {
    nodeId,
    config: configWithDefaults(manifest, node, env.kind),
    kind: env.kind,
    annotator: env.annotator,
    taskId: env.taskId,
    datasetName: env.datasetName,
    startPosition: env.startPosition,
    finished: env.finished,
    input: (portName) => resolveInput(env, nodeId, portName),
    refresh: env.refresh,
    produced: () => env.produced(nodeId),
  };
}
