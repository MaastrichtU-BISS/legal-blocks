import type { Kind, Manifest, Node, Port } from "@legal-blocks/manifest";
import { appliesIn as fieldAppliesIn } from "@legal-blocks/manifest";

export * from "@legal-blocks/manifest";
export { appliesIn as fieldAppliesIn } from "@legal-blocks/manifest";

export interface CorpusDocument {
  name: string;
  full_text: string;
}

export function inputPort(m: Manifest, name: string): Port | undefined {
  return m.inputs?.find((p) => p.name === name);
}

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
