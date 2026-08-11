<script setup lang="ts">
// An exported platform. A step bar across the top, one mounted module below.
//
// There is nothing here about annotation or metrics: the steps come from
// pipeline.json and the modules come from the registry, which is what makes
// this the same code for every platform the composer can produce.

import { computed, ref, watch } from "vue";
import ModuleHost from "./ModuleHost.vue";
import type { ResolveEnv } from "./resolve";
import type { Pipeline, Registry } from "../types";

const props = defineProps<{ pipeline: Pipeline; registry: Registry }>();

/**
 * Who is using the platform. A dropdown for now, and the seam where a real
 * login goes: everything downstream already takes the annotator as an input
 * rather than assuming a single user.
 */
const ANNOTATOR_KEY = "legal-blocks:annotator";
const annotator = ref(Number(localStorage.getItem(ANNOTATOR_KEY)) || 1);
watch(annotator, (value) => localStorage.setItem(ANNOTATOR_KEY, String(value)));

// How many annotators any step in this pipeline was configured for.
const annotatorCount = computed(() => {
  let max = 1;
  for (const node of props.pipeline.nodes) {
    const n = Number(node.config?.annotators ?? 0);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
});

const steps = computed(() => {
  const byId = new Map(props.pipeline.nodes.map((n) => [n.id, n]));
  return props.pipeline.nodes
    .slice()
    .sort((a, b) => orderIndex(a.id) - orderIndex(b.id))
    .map((node) => ({
      node: byId.get(node.id)!,
      manifest: props.registry.modules[node.module],
    }));
});

// Dependency order: a step comes after everything feeding it.
function orderIndex(nodeId: string): number {
  const order: string[] = [];
  const deps = new Map<string, string[]>();
  for (const e of props.pipeline.edges) {
    deps.set(e.to.node, [...(deps.get(e.to.node) ?? []), e.from.node]);
  }
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const dep of deps.get(id) ?? []) walk(dep);
    order.push(id);
  };
  for (const n of props.pipeline.nodes) walk(n.id);
  return order.indexOf(nodeId);
}

const current = ref(0);

// Bumped to re-resolve the visible step's inputs — after a search returns, or
// when the user moves to a step whose upstream data may have changed since it
// was last opened.
const revision = ref(0);

const env = computed<ResolveEnv>(() => ({
  pipeline: props.pipeline,
  registry: props.registry,
  annotator: annotator.value,
  refresh: () => revision.value++,
}));

function goTo(index: number) {
  current.value = index;
  revision.value++;
}
</script>

<template>
  <div class="app">
    <header>
      <strong>{{ pipeline.name }}</strong>

      <nav>
        <button
          v-for="(step, i) in steps"
          :key="step.node.id"
          :class="{ primary: i === current }"
          @click="goTo(i)"
        >
          {{ i + 1 }}. {{ step.node.label || step.manifest?.name || step.node.module }}
        </button>
      </nav>

      <label v-if="annotatorCount > 1" class="who">
        Working as
        <select v-model.number="annotator">
          <option v-for="n in annotatorCount" :key="n" :value="n">Annotator {{ n }}</option>
        </select>
      </label>
    </header>

    <ModuleHost
      v-if="steps[current]"
      :env="env"
      :node="steps[current].node"
      :manifest="steps[current].manifest"
      :revision="revision"
    />
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
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
  flex-wrap: wrap;
}

nav {
  display: flex;
  gap: 0.4rem;
  flex: 1;
}

.who {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
  color: var(--muted);
}

.who select {
  width: auto;
}
</style>
