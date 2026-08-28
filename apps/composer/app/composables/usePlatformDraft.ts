// The platform being designed, and every rule about what may go in it.
//
// Separate from the screens because it is the part with opinions. Which module
// may be added, why one may not, whether a card can be closed without breaking
// its neighbours, whether storage can be switched off — all of that is the
// composer's actual subject, and none of it needs to know how anything looks.

import { computed, ref, watch, type Ref } from "vue";
import type { Kind, Manifest, Node, Pipeline, Registry } from "@base/types";
import { canConnect, configWithDefaults, exportKind, supportsKind } from "@base/types";

// The draft lives in the browser, not the platform database. It is composer
// state — a pipeline that does not exist yet — and never travels into an
// exported platform, so giving it a table would put a design-time concern into
// the runtime's data model.
const DRAFT_KEY = "legal-blocks:composer-draft";

const blank = (): Pipeline => ({ version: 1, name: "My tool", kind: "pipeline", nodes: [] });

export interface Step {
  node: Node;
  manifest: Manifest | undefined;
}

export function usePlatformDraft(registry: Ref<Registry>) {
  /**
   * A pipeline unless somebody asks for storage.
   *
   * There is no screen asking which of two things you are building. The
   * difference is one capability — does this platform keep anything — so it is
   * offered the way every other capability is: a card you add. Not adding it
   * leaves a pipeline, the simpler thing, which is the right default for
   * somebody who has not decided.
   */
  const pipeline = ref<Pipeline>(blank());
  const selected = ref<string | null>(null);
  const problem = ref("");

  const kind = computed<Kind>(() => exportKind(pipeline.value));
  const stored = computed(() => kind.value === "workspace");

  const steps = computed<Step[]>(() =>
    pipeline.value.nodes.map((node) => ({ node, manifest: registry.value.modules[node.module] })),
  );

  // Restore a half-built platform after a closed tab.
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Pipeline;
      if (Array.isArray(parsed.nodes)) pipeline.value = parsed;
    }
  } catch {
    // A corrupt draft is not worth failing over; start from a blank one.
  }
  watch(pipeline, (value) => localStorage.setItem(DRAFT_KEY, JSON.stringify(value)), {
    deep: true,
  });

  /** The type flowing out of the end of the chain, or null when it is empty. */
  const tailType = computed(() => steps.value.at(-1)?.manifest?.outputs?.[0]?.type ?? null);

  /** One of each module per platform — nothing is scoped to a step. */
  function already(m: Manifest): boolean {
    return pipeline.value.nodes.some((n) => n.module === m.id);
  }

  /**
   * Whether a module can be added to the platform as it stands.
   *
   * Two different questions, because a platform is two different things.
   *
   * Without storage it is a chain: data flows from each step to the next, so a
   * step can only be added where the one before it produces what this one
   * reads.
   *
   * With storage there is no chain. Documents become datasets, a task names the
   * dataset and labelset it uses, and the annotate step is opened against a task
   * somebody chose — nothing travels between them. So the platform is a set of
   * things it can do, and the only question is whether a module works with
   * storage at all.
   */
  function canAppend(m: Manifest): boolean {
    if (!supportsKind(m, kind.value)) return false;
    if (already(m)) return false;
    if (stored.value) return true;

    const required = m.inputs?.find((p) => p.required);
    if (!required) return tailType.value === null;
    if (tailType.value === null) return false;
    return canConnect(registry.value, tailType.value, required.type);
  }

  function whyNot(m: Manifest): string {
    if (already(m)) return "Already part of this platform.";
    if (!supportsKind(m, kind.value)) {
      return stored.value
        ? "Only useful when nothing is stored; with storage the data is already kept."
        : "Needs somewhere to store things — add Workspace first.";
    }
    const required = m.inputs?.find((p) => p.required);
    if (!required) return "Only a starting step can go first — this one produces its own data.";
    if (tailType.value === null) return `Needs ${required.type} as input, but the chain is empty.`;
    return `Needs ${required.type}, but the previous step produces ${tailType.value}.`;
  }

  function nextId(moduleId: string): string {
    const base = moduleId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "step";
    let n = 1;
    while (pipeline.value.nodes.some((node) => node.id === `${base}${n}`)) n++;
    return `${base}${n}`;
  }

  function append(m: Manifest) {
    const node: Node = {
      id: nextId(m.id),
      module: m.id,
      label: m.name,
      config: configWithDefaults(m, { id: "", module: m.id, label: "" }, kind.value),
    };
    // Appending is the whole wiring: a step reads what the step before it
    // produces, and canAppend has already established that this one can.
    pipeline.value.nodes.push(node);
    selected.value = node.id;
    problem.value = "";
  }

  /**
   * Whether a card can be closed without breaking what is left.
   *
   * In a workspace, always: nothing depends on anything. In a pipeline the step
   * after this one reads what this one produces, so taking it out of the middle
   * has to leave its neighbours able to meet. Refusing is better than removing
   * and quietly leaving a chain that cannot run — or than deleting the rest of
   * somebody's work to keep it tidy.
   */
  function canRemove(index: number): boolean {
    if (stored.value) return true;
    const after = steps.value[index + 1];
    if (!after?.manifest) return true;

    const required = after.manifest.inputs?.find((p) => p.required);
    if (!required) return true;

    const producing = steps.value[index - 1]?.manifest?.outputs?.[0]?.type;
    return producing ? canConnect(registry.value, producing, required.type) : false;
  }

  function whyNotRemove(index: number): string {
    const after = steps.value[index + 1];
    return `${after?.node.label ?? "The next step"} reads what this step produces. Remove it first.`;
  }

  function remove(index: number) {
    const [gone] = pipeline.value.nodes.splice(index, 1);
    if (gone && selected.value === gone.id) selected.value = null;
    problem.value = "";
  }

  /**
   * Why these modules could not run as a chain, or nothing if they could.
   *
   * Only asked when storage is being turned off. In a workspace nothing flows
   * between the tools, so any set in any order is fine; a pipeline is a line,
   * and the same set may be a line that does not join up.
   */
  function chainProblem(): string {
    for (const [i, node] of pipeline.value.nodes.entries()) {
      const m = registry.value.modules[node.module];
      if (!m) continue;

      if (!supportsKind(m, "pipeline")) {
        return `${m.name} only works in a platform that stores its work.`;
      }

      const required = m.inputs?.find((p) => p.required);
      if (!required) continue;

      const before = pipeline.value.nodes[i - 1];
      const producing = before
        ? registry.value.modules[before.module]?.outputs?.[0]?.type
        : undefined;
      if (!producing || !canConnect(registry.value, producing, required.type)) {
        return before
          ? `${node.label} reads ${required.type}, and ${before.label} before it does not produce that.`
          : `${node.label} needs ${required.type} to work on, and it is first.`;
      }
    }
    return "";
  }

  /**
   * Turning storage on and off.
   *
   * Off is refused when what is on screen would not run as a chain, rather than
   * silently dropping the steps that do not fit. Which modules are there is the
   * user's work, and a toggle is not allowed to throw it away — nor to leave
   * behind a platform the composer would refuse to export.
   */
  function toggleStorage() {
    if (stored.value) {
      const why = chainProblem();
      if (why) {
        problem.value = `This cannot run without storage. ${why}`;
        return;
      }
      pipeline.value.kind = "pipeline";
    } else {
      pipeline.value.kind = "workspace";
    }
    problem.value = "";
  }

  function startOver() {
    if (
      pipeline.value.nodes.length > 0 &&
      !confirm("Start over? This clears what you have built.")
    ) {
      return;
    }
    pipeline.value = blank();
    selected.value = null;
    problem.value = "";
  }

  return {
    pipeline,
    selected,
    problem,
    kind,
    stored,
    steps,
    canAppend,
    whyNot,
    append,
    canRemove,
    whyNotRemove,
    remove,
    toggleStorage,
    startOver,
  };
}
