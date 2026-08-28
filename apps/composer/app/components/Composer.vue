<script setup lang="ts">
// The composer: pick modules, arrange them, export.
//
// What a platform is depends on where its data lives, and this is where that
// shows most.
//
// Without storage it is a chain: search -> annotate -> metrics, each step
// reading what the one before produced. Appending to that chain is all the
// wiring there is — the order is the connection, in this UI and in
// pipeline.json alike, so there is nothing here to draw or to keep in step.
//
// With storage it is not a chain at all. It is a set of things the platform can
// do, all of them reaching the same database; the people using it make
// datasets, labelsets and tasks. Nothing flows from one tool to the next, which
// is why that layout is a ring around the store rather than a line.

import { computed, ref, watch } from "vue";
import ConfigForm from "./ConfigForm.vue";
import ModuleIcon from "./ModuleIcon.vue";
import { exportPipeline } from "@base/api";
import type { Manifest, Kind, Node, Pipeline, Registry } from "@base/types";
import { canConnect, configWithDefaults, fieldAppliesIn, exportKind, supportsKind } from "@base/types";

const props = defineProps<{ registry: Registry }>();

// The draft lives in the browser, not the platform database. It is composer
// state — a pipeline that does not exist yet — and never travels into an
// exported platform, so giving it a table would put a design-time concern into
// the runtime's data model.
const DRAFT_KEY = "legal-blocks:composer-draft";

/**
 * A pipeline unless somebody asks for storage.
 *
 * There is no screen asking which of two things you are building any more. The
 * difference is one capability — does this platform keep anything — so it is
 * offered the same way every other capability is: a card you add. Adding it
 * makes a workspace; not adding it leaves a pipeline, which is the simpler
 * thing and the right default for someone who has not decided.
 */
const pipeline = ref<Pipeline>({
  version: 1,
  name: "My tool",
  kind: "pipeline",
  nodes: [],
});

const kind = computed<Kind>(() => exportKind(pipeline.value));
const stored = computed(() => kind.value === "workspace");

const selected = ref<string | null>(null);
const status = ref("");
const problem = ref("");

// Restore a half-built pipeline after a closed tab.
try {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (saved) {
    const parsed = JSON.parse(saved) as Pipeline;
    if (Array.isArray(parsed.nodes)) pipeline.value = parsed;
  }
} catch {
  // A corrupt draft is not worth failing over; start from a blank one.
}
watch(
  pipeline,
  (value) => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
  },
  { deep: true },
);

function startOver() {
  if (pipeline.value.nodes.length > 0 && !confirm("Start over? This clears what you have built.")) {
    return;
  }
  pipeline.value = { version: 1, name: "My tool", kind: "pipeline", nodes: [] };
  selected.value = null;
  problem.value = "";
}

/**
 * Why these modules could not run as a chain, or nothing if they could.
 *
 * Only asked when storage is being turned off. In a workspace nothing flows
 * between the tools, so any set in any order is fine; a pipeline is a line, and
 * the same set may be a line that does not join up.
 */
function chainProblem(): string {
  for (const [i, node] of pipeline.value.nodes.entries()) {
    const m = props.registry.modules[node.module];
    if (!m) continue;

    if (!supportsKind(m, "pipeline")) {
      return `${m.name} only works in a platform that stores its work.`;
    }

    const required = m.inputs?.find((p) => p.required);
    if (!required) continue;

    const before = pipeline.value.nodes[i - 1];
    const producing = before ? props.registry.modules[before.module]?.outputs?.[0]?.type : undefined;
    if (!producing || !canConnect(props.registry, producing, required.type)) {
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

const palette = computed(() =>
  Object.values(props.registry.modules).sort((a, b) => a.name.localeCompare(b.name)),
);

/** Settings the composer owns in this mode; the rest belong to runtime users. */
function fieldsFor(m: Manifest) {
  return (m.config ?? []).filter((f) => fieldAppliesIn(f, kind.value));
}

const chain = computed(() =>
  pipeline.value.nodes.map((node) => ({ node, manifest: props.registry.modules[node.module] })),
);

/** The type flowing out of the end of the chain, or null when it is empty. */
const tailType = computed(() => {
  const last = chain.value.at(-1);
  return last?.manifest?.outputs?.[0]?.type ?? null;
});

/**
 * Whether a module can be added to the platform as it stands.
 *
 * Two different questions, because a platform is two different things.
 *
 * Without storage it is a chain: data flows from each step to the next, so a
 * step can only be added where the one before it produces what this one reads.
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
  return canConnect(props.registry, tailType.value, required.type);
}

/** One of each module per platform — nothing is scoped to a step. */
function already(m: Manifest): boolean {
  return pipeline.value.nodes.some((n) => n.module === m.id);
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
  const after = chain.value[index + 1];
  if (!after?.manifest) return true;

  const required = after.manifest.inputs?.find((p) => p.required);
  if (!required) return true;

  const before = chain.value[index - 1];
  const producing = before?.manifest?.outputs?.[0]?.type;
  return producing ? canConnect(props.registry, producing, required.type) : false;
}

function whyNotRemove(index: number): string {
  const after = chain.value[index + 1];
  const name = after?.node.label ?? "the next step";
  return `${name} reads what this step produces. Remove it first.`;
}

function remove(index: number) {
  const [gone] = pipeline.value.nodes.splice(index, 1);
  if (gone && selected.value === gone.id) selected.value = null;
  problem.value = "";
}

const selectedNode = computed(() => pipeline.value.nodes.find((n) => n.id === selected.value));
const selectedManifest = computed(() =>
  selectedNode.value ? props.registry.modules[selectedNode.value.module] : null,
);

function updateConfig(config: Record<string, unknown>) {
  if (selectedNode.value) selectedNode.value.config = config;
}

/**
 * Where each card sits on the ring, and where its connector runs.
 *
 * A workspace has a store in the middle and everything reaching it, so the
 * honest picture is a ring rather than a line. Positions are percentages of the
 * board so it stays right at any width; the connector stops short of both ends
 * so the arrowheads do not sit under the card or under the database.
 */
const RING = 34;

function ringStyle(index: number, total: number): Record<string, string> {
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  return {
    left: `${50 + RING * Math.cos(angle)}%`,
    top: `${50 + RING * Math.sin(angle)}%`,
  };
}

/** The line from the middle out to one card, trimmed at both ends. */
function spoke(index: number, total: number): Record<string, number> {
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  const inner = 9;
  const outer = RING - 8;
  return {
    x1: 50 + inner * Math.cos(angle),
    y1: 50 + inner * Math.sin(angle),
    x2: 50 + outer * Math.cos(angle),
    y2: 50 + outer * Math.sin(angle),
  };
}

async function doExport() {
  problem.value = "";
  status.value = "Building…";
  try {
    await exportPipeline(pipeline.value);
    status.value = "Downloaded.";
  } catch (e) {
    problem.value = e instanceof Error ? e.message : String(e);
    status.value = "";
  }
}
</script>

<template>
  <div class="app lb-ui">
    <header>
      <input v-model="pipeline.name" class="name" aria-label="Platform name" />

      <div class="row modes">
        <span class="muted">{{ stored ? "Workspace" : "Pipeline" }}</span>
        <button @click="startOver">Start over</button>
      </div>

      <div class="row">
        <span v-if="status" class="muted">{{ status }}</span>
        <button class="primary" :disabled="pipeline.nodes.length === 0" @click="doExport">
          Export platform
        </button>
      </div>
    </header>

    <p v-if="problem" class="error pad">{{ problem }}</p>

    <div class="columns">
      <section class="palette">
        <h2>Available</h2>

        <!-- Storage first, because it changes what everything else means.
             Not a registry module: it has no package and nothing to mount —
             it is the one capability the platform itself provides. -->
        <div class="module" :class="{ on: stored }">
          <div class="row">
            <span class="ico"><ModuleIcon name="database" /></span>
            <strong>Workspace</strong>
            <button :class="{ primary: !stored }" @click="toggleStorage">
              {{ stored ? "Remove" : "Add" }}
            </button>
          </div>
          <p class="muted small">
            Gives the platform a database. Whoever uses it makes their own documents, labels
            and tasks, everything is saved as they go, and several people can share it.
            Without this the platform keeps nothing: work stays in the browser for one
            session and leaves through a download.
          </p>
        </div>

        <div v-for="m in palette" :key="m.id" class="module">
          <div class="row">
            <span class="ico"><ModuleIcon :name="m.icon" /></span>
            <strong>{{ m.name }}</strong>
            <button :disabled="!canAppend(m)" :title="canAppend(m) ? '' : whyNot(m)" @click="append(m)">
              Add
            </button>
          </div>
          <p class="muted small">{{ m.description }}</p>
        </div>
      </section>

      <section class="board">
        <p v-if="chain.length === 0" class="muted empty">
          <template v-if="stored">
            Add the tools this workspace should have. They do not connect to each other —
            everything reaches the same database.
          </template>
          <template v-else>
            Add a starting step from the left. Steps can only be joined where the data one
            produces is data the next can read.
          </template>
        </p>

        <!-- A pipeline is a line: each card reads what the one before it made. -->
        <div v-else-if="!stored" class="flow">
          <template v-for="(step, i) in chain" :key="step.node.id">
            <div
              class="card"
              :class="{ selected: step.node.id === selected }"
              @click="selected = step.node.id"
            >
              <button
                class="close"
                :disabled="!canRemove(i)"
                :title="canRemove(i) ? 'Remove this step' : whyNotRemove(i)"
                @click.stop="remove(i)"
              >
                ×
              </button>
              <span class="ico big"><ModuleIcon :name="step.manifest?.icon" :size="26" /></span>
              <strong>{{ step.node.label }}</strong>
              <span class="muted small">{{ step.manifest?.id }}</span>
            </div>

            <span
              v-if="i < chain.length - 1"
              class="arrow"
              :title="step.manifest?.outputs?.[0]?.type"
            >→</span>
          </template>
        </div>

        <!-- A workspace is a ring: nothing flows between the tools, they all
             reach the same store. The arrows run both ways because each of
             them both reads and writes. -->
        <div v-else class="ring">
          <svg class="spokes" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <!-- Drawn at both ends of every spoke: a tool reads from the
                   store and writes back to it, so a single arrow would be
                   telling half the truth. -->
              <marker
                id="lb-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M0 1 L7 4 L0 7 z" fill="currentColor" />
              </marker>
            </defs>
            <line
              v-for="(step, i) in chain"
              :key="step.node.id"
              v-bind="spoke(i, chain.length)"
              class="spoke"
            />
          </svg>

          <div class="store" :title="'Everything is saved here'">
            <ModuleIcon name="database" :size="30" />
            <span class="small">Database</span>
          </div>

          <div
            v-for="(step, i) in chain"
            :key="step.node.id"
            class="card on-ring"
            :class="{ selected: step.node.id === selected }"
            :style="ringStyle(i, chain.length)"
            @click="selected = step.node.id"
          >
            <button class="close" title="Remove this tool" @click.stop="remove(i)">×</button>
            <span class="ico big"><ModuleIcon :name="step.manifest?.icon" :size="26" /></span>
            <strong>{{ step.node.label }}</strong>
            <span class="muted small">{{ step.manifest?.id }}</span>
          </div>
        </div>
      </section>

      <section class="settings">
        <h2>Settings</h2>
        <template v-if="selectedNode && selectedManifest">
          <label class="field">
            <span>Step name</span>
            <input v-model="selectedNode.label" />
          </label>
          <!-- ConfigForm says so itself when there is nothing to show. -->
          <ConfigForm
            :fields="fieldsFor(selectedManifest)"
            :config="selectedNode.config ?? {}"
            @update="updateConfig"
          />
        </template>
        <p v-else class="muted small">Select a step to configure it.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
}

.name {
  width: auto;
  min-width: 14rem;
  font-weight: 600;
}

.modes {
  margin-left: auto;
}

.modes button {
  padding: 0.25rem 0.6rem;
}

.columns {
  display: grid;
  grid-template-columns: 20rem 1fr 20rem;
  flex: 1;
  min-height: 0;
}

.columns > section {
  padding: 1rem;
  overflow: auto;
}

.palette,
.settings {
  background: var(--bg-soft);
}

.palette {
  border-right: 1px solid var(--border);
}

.settings {
  border-left: 1px solid var(--border);
}

h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: 0 0 0.8rem;
}

.small {
  font-size: 0.9em;
}

/* --- the palette ---------------------------------------------------------- */

.module {
  margin-bottom: 1rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid var(--border);
}

.module:last-child {
  border-bottom: 0;
}

.module .row {
  gap: 0.5rem;
  align-items: center;
}

.module .row button {
  margin-left: auto;
}

.module p {
  margin: 0.2rem 0 0;
  line-height: 1.45;
}

/* Storage on: say so in the palette, since it governs everything under it. */
.module.on strong::after {
  content: " · on";
  color: var(--accent);
  font-weight: 500;
}

.ico {
  display: inline-flex;
  color: var(--muted);
}

.ico.big {
  color: var(--accent);
}

/* --- the board ------------------------------------------------------------ */

.board {
  display: flex;
  flex-direction: column;
}

.empty {
  max-width: 26rem;
  line-height: 1.5;
}

.card {
  position: relative;
  width: 9.5rem;
  min-height: 6.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  text-align: center;
  padding: 0.9rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.card:hover {
  border-color: var(--accent);
}

.card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.card strong {
  font-size: 0.9rem;
  line-height: 1.2;
}

/* Only on hover or when chosen: eight cards each showing a × is a wall of
   crosses, and the one that matters is the one under the cursor. */
.close {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 1.2rem;
  height: 1.2rem;
  padding: 0;
  line-height: 1;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
}

.card:hover .close,
.card.selected .close,
.close:focus-visible {
  opacity: 1;
}

.close:hover:not(:disabled) {
  background: var(--border);
  color: #b91c1c;
}

.close:disabled {
  cursor: default;
  opacity: 0.35;
}

/* --- a pipeline: a line that wraps --------------------------------------- */

.flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.arrow {
  color: var(--muted);
  font-size: 1.2rem;
  user-select: none;
}

/* --- a workspace: a ring around the store -------------------------------- */

.ring {
  position: relative;
  flex: 1;
  min-height: 26rem;
  /* Square-ish, so the ring is a ring rather than an ellipse. */
  aspect-ratio: 1 / 1;
  max-width: 40rem;
  margin: 0 auto;
  align-self: center;
  width: 100%;
}

.spokes {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.spoke {
  stroke: var(--border);
  stroke-width: 0.5;
  /* Both ways: every tool reads from the store and writes back to it. */
  /* One marker, both ends: orient="auto-start-reverse" is exactly the
     instruction to flip it at the start, so a second mirrored marker only
     un-flips it again. */
  marker-start: url(#lb-arrow);
  marker-end: url(#lb-arrow);
}

.store {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  width: 7rem;
  height: 7rem;
  justify-content: center;
  border: 1px solid var(--accent);
  border-radius: 50%;
  background: #fff;
  color: var(--accent);
}

.on-ring {
  position: absolute;
  transform: translate(-50%, -50%);
}

/* --- settings ------------------------------------------------------------- */

.field {
  display: block;
  margin-bottom: 0.9rem;
}

.field span {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
}
</style>
