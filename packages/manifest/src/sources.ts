// What a stored platform needs in order to be usable.
//
// A pipeline cannot be built with a step whose input nothing produces: the
// composer only lets a step follow one that feeds it. A workspace has no
// chain, so the same mistake is easy to make there: Annotate with nothing that
// brings documents in is a tab nobody can ever use. This finds those.

import type { Manifest, Port, Registry } from "./manifest.js";
import { canConnect } from "./manifest.js";
import type { Node, Pipeline } from "./pipeline.js";
import { exportKind } from "./pipeline.js";
import { supportsKind } from "./manifest.js";

/** One required input in a workspace that no other module provides. */
export interface UnmetInput {
  node: Node;
  module: Manifest;
  port: Port;
  /** Modules in the registry that would provide it, to suggest adding one. */
  providers: Manifest[];
}

export function unmetInputs(p: Pipeline, reg: Registry): UnmetInput[] {
  if (exportKind(p) !== "workspace") return [];

  const unmet: UnmetInput[] = [];
  for (const node of p.nodes) {
    const module = reg.modules[node.module];
    if (!module) continue;
    for (const port of module.inputs ?? []) {
      if (!port.required) continue;
      // Another module's output, never this one's: Explore passes its input on,
      // and that does not make it a source of what it reads.
      const provided = p.nodes.some(
        (other) =>
          other.id !== node.id &&
          (reg.modules[other.module]?.outputs ?? []).some((out) =>
            canConnect(reg, out.type, port.type),
          ),
      );
      if (provided) continue;
      const providers = Object.values(reg.modules).filter(
        (m) =>
          m.id !== module.id &&
          supportsKind(m, "workspace") &&
          (m.outputs ?? []).some((out) => canConnect(reg, out.type, port.type)),
      );
      unmet.push({ node, module, port, providers });
    }
  }
  return unmet;
}

const NOUNS: Record<string, string> = {
  "corpus@1": "documents",
  "document-set@1": "search results",
  "annotated-task@1": "annotated tasks",
};

/** "Annotate needs documents, but nothing here brings them in. Add Import documents." */
export function describeUnmet(u: UnmetInput): string {
  const what = NOUNS[u.port.type] ?? u.port.type;
  const name = u.node.label || u.module.name;
  const add = u.providers.map((m) => m.name);
  const suggestion = add.length
    ? ` Add ${add.length > 1 ? `${add.slice(0, -1).join(", ")} or ${add.at(-1)}` : add[0]}.`
    : "";
  return `${name} needs ${what}, but nothing in this platform provides them.${suggestion}`;
}
