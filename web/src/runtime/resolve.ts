// Resolving a node's inputs by walking the pipeline backwards.
//
// The runtime never needs a "run the pipeline" pass: a step asks for its
// inputs when it is opened, that request walks back through the edges to
// whatever produces them, and adapters convert along the way. Steps a user has
// not opened cost nothing.

import { adapt } from "../adapters";
import type { Mode, Pipeline, Registry } from "../types";
import { inputPort, outputPort, configWithDefaults } from "../types";
import { bindingFor, type BindingContext } from "./bindings";

export interface ResolveEnv {
  pipeline: Pipeline;
  registry: Registry;
  /** Where this platform's data lives. */
  mode: Mode;
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
  refresh(): void;
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

  return bindingFor(manifest.host, env.mode).output(contextFor(env, nodeId), portName);
}

/**
 * Resolves the value arriving on `nodeId`'s input port, converting it if the
 * upstream port carries a different — but adaptable — type.
 */
export async function resolveInput(
  env: ResolveEnv,
  nodeId: string,
  portName: string,
): Promise<unknown> {
  const edge = env.pipeline.edges.find((e) => e.to.node === nodeId && e.to.port === portName);
  if (!edge) {
    throw new Error(`nothing is connected to "${portName}" on step "${nodeId}"`);
  }

  const value = await produce(env, edge.from.node, edge.from.port);

  const fromNode = env.pipeline.nodes.find((n) => n.id === edge.from.node)!;
  const toNode = env.pipeline.nodes.find((n) => n.id === nodeId)!;
  const fromType = outputPort(env.registry.modules[fromNode.module], edge.from.port)?.type;
  const toType = inputPort(env.registry.modules[toNode.module], portName)?.type;
  if (!fromType || !toType) {
    throw new Error(`pipeline connects a port that does not exist (${edge.from.node} -> ${nodeId})`);
  }

  return adapt(fromType, toType, value);
}

/** The context handed to a binding for one node. */
export function contextFor(env: ResolveEnv, nodeId: string): BindingContext {
  const node = env.pipeline.nodes.find((n) => n.id === nodeId)!;
  const manifest = env.registry.modules[node.module];
  return {
    nodeId,
    config: configWithDefaults(manifest, node, env.mode),
    mode: env.mode,
    annotator: env.annotator,
    taskId: env.taskId,
    datasetName: env.datasetName,
    input: (portName) => resolveInput(env, nodeId, portName),
    refresh: env.refresh,
  };
}
