<script setup lang="ts">
// The composer: pick modules, configure them, export.
//
// What a platform is depends on where its data lives, and this is where that
// shows most.
//
// Without storage it is a chain: search -> annotate -> metrics, each step
// reading what the one before produced. The list is linear because every
// example the design started from is, and a linear list needs a fraction of
// the code a free-form canvas does. The model underneath is still a graph —
// nodes and edges, exactly as pipeline.json stores it — so branching later is
// a UI change rather than a data change.
//
// With storage it is not a chain at all. It is a list of what the platform can
// do; the people using it make datasets, labelsets and tasks, and a task says
// which of each it uses. Nothing flows along an edge, so nothing needs
// connecting here.

import { computed, ref, watch } from "vue";
import ConfigForm from "./ConfigForm.vue";
import Runtime from "../runtime/Runtime.vue";
import { exportPipeline, preparePreview, validatePipeline } from "../api";
import type { Manifest, Kind, Node, Pipeline, Registry } from "../types";
import { canConnect, configWithDefaults, fieldAppliesIn, exportKind, supportsKind } from "../types";

const props = defineProps<{ registry: Registry }>();

// The draft lives in the browser, not the platform database. It is composer
// state — a pipeline that does not exist yet — and never travels into an
// exported platform, so giving it a table would put a design-time concern into
// the runtime's data model.
const DRAFT_KEY = "legal-blocks:composer-draft";

const pipeline = ref<Pipeline>({
  version: 1,
  name: "",
  nodes: [],
  edges: [],
});

/**
 * Nothing is chosen until somebody chooses it.
 *
 * The two kinds are not settings on one thing; they are two different things
 * to build, and almost every rule below follows from which. Asking up front —
 * once, in the words of what is being made rather than where data lives —
 * replaces a toggle that silently threw away your work when you touched it.
 */
const chosen = computed(() => pipeline.value.kind !== undefined);

function start(next: Kind) {
  pipeline.value = {
    version: 1,
    name: next === "pipeline" ? "My tool" : "My workspace",
    kind: next,
    nodes: [],
    edges: [],
  };
  selected.value = null;
  problem.value = "";
}

/** Back to the picker. Everything so far belonged to the other kind. */
function startOver() {
  if (pipeline.value.nodes.length > 0 && !confirm("Start over? This clears what you have built.")) {
    return;
  }
  pipeline.value = { version: 1, name: "", nodes: [], edges: [] };
  selected.value = null;
  problem.value = "";
}

const kind = computed<Kind>(() => exportKind(pipeline.value));

const selected = ref<string | null>(null);
const previewing = ref(false);
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
 * somebody chose — nothing travels along an edge. So the pipeline is a list of
 * what this platform can do, and the only question is whether a module works
 * with storage at all. Asking for a document source before an annotate step
 * would be asking somebody to draw a connection that does not exist.
 */
function canAppend(m: Manifest): boolean {
  if (!supportsKind(m, kind.value)) return false;
  if (already(m)) return false;
  if (kind.value === "workspace") return true;

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
    return kind.value === "pipeline"
      ? "Needs somewhere to store things — only available when work is saved."
      : "Only useful when nothing is stored; with storage the data is already kept.";
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
  const previous = chain.value.at(-1);

  pipeline.value.nodes.push(node);
  // Edges only mean something without storage. With it, a task says which
  // dataset and labelset it uses, so an edge here would claim a connection
  // the platform does not actually make.
  const required = kind.value === "pipeline" ? m.inputs?.find((p) => p.required) : undefined;
  if (previous && required) {
    pipeline.value.edges.push({
      from: { node: previous.node.id, port: previous.manifest.outputs![0].name },
      to: { node: node.id, port: required.name },
    });
  }
  selected.value = node.id;
  problem.value = "";
}

/**
 * Removes the last step. Only the last one: removing from the middle would
 * leave the chain disconnected, and re-wiring around a gap is the sort of
 * thing a real canvas does and a proof of concept does not need.
 */
function removeLast() {
  const removed = pipeline.value.nodes.pop();
  if (!removed) return;
  pipeline.value.edges = pipeline.value.edges.filter(
    (e) => e.from.node !== removed.id && e.to.node !== removed.id,
  );
  if (selected.value === removed.id) selected.value = null;
}

const selectedNode = computed(() => pipeline.value.nodes.find((n) => n.id === selected.value));
const selectedManifest = computed(() =>
  selectedNode.value ? props.registry.modules[selectedNode.value.module] : null,
);

function updateConfig(config: Record<string, unknown>) {
  if (selectedNode.value) selectedNode.value.config = config;
}

async function preview() {
  problem.value = "";
  const result = await validatePipeline(pipeline.value);
  if (!result.valid) {
    problem.value = result.error ?? "This pipeline is not valid.";
    return;
  }
  try {
    // Preview runs against the real services, so the server needs whatever
    // access tokens this draft carries before the first request goes out.
    await preparePreview(pipeline.value);
  } catch (e) {
    problem.value = e instanceof Error ? e.message : String(e);
    return;
  }
  previewing.value = true;
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
  <div v-if="previewing" class="preview">
    <div class="preview-bar lb-ui">
      <span>Preview — this is exactly what the exported platform runs.</span>
      <button @click="previewing = false">Back to composer</button>
    </div>
    <Runtime :pipeline="pipeline" :registry="registry" />
  </div>

  <!-- Before anything else: what is being made. -->
  <div v-else-if="!chosen" class="app lb-ui start">
    <h1>What are you building?</h1>
    <div class="choices">
      <button class="choice" @click="start('pipeline')">
        <strong>A pipeline</strong>
        <span class="muted">
          Runs start to finish. Documents go in one end and results come out the other, each
          step reading what the one before produced. Nothing is kept afterwards, so work
          leaves through a download.
        </span>
        <span class="muted small">Like a case-law explorer: search, then look at what came back.</span>
      </button>

      <button class="choice" @click="start('workspace')">
        <strong>A workspace</strong>
        <span class="muted">
          Somewhere people come back to. Whoever uses it makes their own documents, labels and
          tasks, and everything is stored — so several people can share it and work survives.
        </span>
        <span class="muted small">Like an annotation platform: upload, define a task, hand it out.</span>
      </button>
    </div>
  </div>

  <div v-else class="app lb-ui">
    <header>
      <input v-model="pipeline.name" class="name" aria-label="Platform name" />

      <div class="row modes">
        <span class="muted">{{ kind === "pipeline" ? "Pipeline" : "Workspace" }}</span>
        <button @click="startOver">Start over</button>
      </div>

      <div class="row">
        <span v-if="status" class="muted">{{ status }}</span>
        <button :disabled="pipeline.nodes.length === 0" @click="preview">Preview</button>
        <button class="primary" :disabled="pipeline.nodes.length === 0" @click="doExport">
          Export platform
        </button>
      </div>
    </header>

    <p v-if="problem" class="error pad">{{ problem }}</p>

    <div class="columns">
      <section class="palette">
        <h2>{{ kind === "pipeline" ? "Steps" : "Tools" }} available</h2>
        <div v-for="m in palette" :key="m.id" class="module">
          <div class="row">
            <strong>{{ m.name }}</strong>
            <button :disabled="!canAppend(m)" :title="canAppend(m) ? '' : whyNot(m)" @click="append(m)">
              Add
            </button>
          </div>
          <p class="muted small">{{ m.description }}</p>
        </div>
      </section>

      <section class="chain">
        <h2>{{ kind === "pipeline" ? "Steps" : "Tools" }}</h2>
        <p class="muted mode-note">
          <template v-if="kind === 'pipeline'">
            Nothing is stored. Work stays in the browser for the session, and leaves through a
            download step.
          </template>
          <template v-else>
            Everything is saved in the platform's own database, so work survives and several
            people can share it. These are the things the platform can do — the people using
            it make their own datasets, labelsets and tasks, so there is nothing to connect
            here and nothing to configure now.
          </template>
        </p>

        <p v-if="chain.length === 0 && kind === 'workspace'" class="muted">
          Add the tools this workspace should have. They do not connect to each other — the
          people using it decide what work exists.
        </p>
        <p v-else-if="chain.length === 0" class="muted">
          Add a starting step from the left. Steps can only be connected when the data one produces
          is data the next can read.
        </p>

        <template v-else>
          <div v-for="(step, i) in chain" :key="step.node.id">
            <div
              class="step"
              :class="{ selected: step.node.id === selected }"
              @click="selected = step.node.id"
            >
              <strong>{{ i + 1 }}. {{ step.node.label }}</strong>
              <span class="muted small">{{ step.manifest.id }}</span>
            </div>
            <!-- The wire is only real without storage. With it there are no
                 edges, so drawing one would claim a connection the platform
                 does not make. -->
            <p v-if="kind === 'pipeline' && i < chain.length - 1" class="wire muted small">
              ↓ {{ step.manifest.outputs?.[0]?.type }}
            </p>
          </div>
          <button v-if="chain.length" class="remove" @click="removeLast">
            Remove last {{ kind === "pipeline" ? "step" : "tool" }}
          </button>
        </template>
      </section>

      <section class="config">
        <h2>Settings</h2>
        <p v-if="!selectedNode" class="muted">Select a step to configure it.</p>
        <template v-else-if="selectedManifest">
          <div class="field">
            <label for="step-label">Step name</label>
            <input id="step-label" v-model="selectedNode.label" />
          </div>
          <ConfigForm
            :fields="fieldsFor(selectedManifest)"
            :model-value="selectedNode.config ?? {}"
            @update:model-value="updateConfig"
          />
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.app,
.preview {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
}

.start {
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 3rem 1rem;
}

.start h1 {
  font-size: 1.3rem;
  margin: 0;
}

.choices {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  max-width: 48rem;
}

.choice {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  text-align: left;
  flex: 1 1 20rem;
  padding: 1.25rem;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}

.choice:hover {
  border-color: var(--accent);
}

.choice strong {
  font-size: 1.05rem;
}

.name {
  width: auto;
  min-width: 14rem;
  font-weight: 600;
}

.modes button {
  padding: 0.25rem 0.6rem;
}

.mode-note {
  margin: 0 0 1rem;
  line-height: 1.5;
}

.preview-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: #fef3c7;
  border-bottom: 1px solid #fcd34d;
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
.config {
  background: var(--bg-soft);
}

.palette {
  border-right: 1px solid var(--border);
}

.config {
  border-left: 1px solid var(--border);
}

h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: 0 0 0.8rem;
}

.module {
  margin-bottom: 1rem;
}

.module .row {
  justify-content: space-between;
}

.small {
  font-size: 0.9em;
}

.module p {
  margin: 0.2rem 0 0;
}

.step {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.6rem 0.8rem;
  background: #fff;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}

.step.selected {
  border-color: var(--accent);
}

.wire {
  margin: 0.3rem 0 0.3rem 0.8rem;
}

.remove {
  margin-top: 1rem;
}

.field {
  margin-bottom: 0.9rem;
}

.field label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
}
</style>
