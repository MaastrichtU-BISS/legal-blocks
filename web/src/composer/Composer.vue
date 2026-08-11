<script setup lang="ts">
// The composer: pick modules, chain them, configure them, export.
//
// The chain is linear. Every example the design started from is a chain
// (search -> annotate -> metrics), and a linear list needs a fraction of the
// code a free-form canvas does. The underlying model is still a graph — nodes
// and edges, exactly as pipeline.json stores it — so branching later is a UI
// change, not a data change.

import { computed, ref, watch } from "vue";
import ConfigForm from "./ConfigForm.vue";
import Runtime from "../runtime/Runtime.vue";
import { exportPipeline, validatePipeline } from "../api";
import type { Manifest, Node, Pipeline, Registry } from "../types";
import { canConnect, configWithDefaults } from "../types";

const props = defineProps<{ registry: Registry }>();

// The draft lives in the browser, not the platform database. It is composer
// state — a pipeline that does not exist yet — and never travels into an
// exported platform, so giving it a table would put a design-time concern into
// the runtime's data model.
const DRAFT_KEY = "legal-blocks:composer-draft";

const pipeline = ref<Pipeline>({ version: 1, name: "My platform", nodes: [], edges: [] });
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

const chain = computed(() =>
  pipeline.value.nodes.map((node) => ({ node, manifest: props.registry.modules[node.module] })),
);

/** The type flowing out of the end of the chain, or null when it is empty. */
const tailType = computed(() => {
  const last = chain.value.at(-1);
  return last?.manifest?.outputs?.[0]?.type ?? null;
});

/**
 * Whether a module can be appended. This is the same rule the Go side
 * enforces when a pipeline is exported; the UI applies it up front so an
 * impossible platform cannot be built in the first place.
 */
function canAppend(m: Manifest): boolean {
  const required = m.inputs?.find((p) => p.required);
  if (!required) return tailType.value === null;
  if (tailType.value === null) return false;
  return canConnect(props.registry, tailType.value, required.type);
}

function whyNot(m: Manifest): string {
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
    config: configWithDefaults(m, { id: "", module: m.id, label: "" }),
  };
  const previous = chain.value.at(-1);

  pipeline.value.nodes.push(node);
  const required = m.inputs?.find((p) => p.required);
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

  <div v-else class="app lb-ui">
    <header>
      <input v-model="pipeline.name" class="name" aria-label="Platform name" />
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
        <h2>Modules</h2>
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
        <h2>Platform</h2>
        <p v-if="chain.length === 0" class="muted">
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
            <p v-if="i < chain.length - 1" class="wire muted small">
              ↓ {{ step.manifest.outputs?.[0]?.type }}
            </p>
          </div>
          <button class="remove" @click="removeLast">Remove last step</button>
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
            :fields="selectedManifest.config ?? []"
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

.name {
  width: auto;
  min-width: 18rem;
  font-weight: 600;
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
