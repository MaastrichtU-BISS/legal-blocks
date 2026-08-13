<script setup lang="ts">
// An exported platform. A step bar across the top, one mounted module below.
//
// There is nothing here about annotation or metrics: the steps come from
// pipeline.json and the modules come from the registry, which is what makes
// this the same code for every platform the composer can produce.

import { computed, ref, watch } from "vue";
import ModuleHost from "./ModuleHost.vue";
import PlatformWorkspace from "../workspace/PlatformWorkspace.vue";
import type { ResolveEnv } from "./resolve";
import type { Pipeline, Registry } from "../types";
import { exportKind } from "../types";
import { getUsers, type User } from "../api";

const props = defineProps<{ pipeline: Pipeline; registry: Registry }>();

const kind = computed(() => exportKind(props.pipeline));

/**
 * Who is using the platform.
 *
 * These are real rows in the users table, not positions in a list, so the
 * dropdown selects an identity that everything downstream already keys off.
 * That is the seam a login replaces: the selector goes, the user id stays.
 */
const ANNOTATOR_KEY = "legal-blocks:user";
const users = ref<User[]>([]);
const annotator = ref(Number(localStorage.getItem(ANNOTATOR_KEY)) || 0);
watch(annotator, (value) => localStorage.setItem(ANNOTATOR_KEY, String(value)));

// Steps must not mount before we know who is working: a queue is per-user, and
// asking for user 0's queue returns nothing, which looks exactly like a task
// with no documents. A stored platform mounts the workspace regardless — its
// first visitor has no identity yet because nobody has made a task.
const identified = computed(() => kind.value === "workspace" || annotator.value > 0);

/**
 * Who can work here.
 *
 * With storage these are rows in the users table, put there when somebody was
 * named as an annotator on a task. A platform with no tasks yet has nobody in
 * it, which is why the workspace does not wait for an identity the way the
 * step runner does — the Tasks tab is exactly where the first people arrive.
 *
 * Without storage there is no users table and nobody to be: the annotators are
 * simply the positions the platform was composed for.
 */
async function loadUsers() {
  users.value = kind.value === "pipeline" ? sessionAnnotators() : await getUsers();
  if (!users.value.some((u) => u.id === annotator.value)) {
    annotator.value = users.value[0]?.id ?? 0;
  }
}

/** The annotator slots an ephemeral platform was composed with. */
function sessionAnnotators(): User[] {
  let count = 1;
  for (const node of props.pipeline.nodes) {
    const n = Number(node.config?.annotators ?? 0);
    if (Number.isFinite(n) && n > count) count = n;
  }
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Annotator ${i + 1}`,
    email: "",
    role: "annotator",
  }));
}

void loadUsers();

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
  kind: kind.value,
  annotator: annotator.value,
  refresh: () => revision.value++,
}));

function goTo(index: number) {
  current.value = index;
  revision.value++;
  // A step may have created more users when it prepared its task.
  void loadUsers();
}
</script>

<template>
  <div class="app">
    <!-- lb-ui goes on the header, not on .app: the shell's control styling
         must not reach the module mounted below it. -->
    <header class="lb-ui">
      <strong>{{ pipeline.name }}</strong>

      <nav v-if="kind === 'pipeline'">
        <button
          v-for="(step, i) in steps"
          :key="step.node.id"
          :class="{ primary: i === current }"
          @click="goTo(i)"
        >
          {{ i + 1 }}. {{ step.node.label || step.manifest?.name || step.node.module }}
        </button>
      </nav>

      <label v-if="users.length > 1" class="who">
        Working as
        <select v-model.number="annotator">
          <option v-for="u in users" :key="u.id" :value="u.id">
            {{ u.email || u.name }}
          </option>
        </select>
      </label>
    </header>

    <p v-if="!identified" class="pad muted">Starting…</p>
    <PlatformWorkspace
      v-else-if="kind === 'workspace'"
      :env="env"
      :pipeline="pipeline"
      :registry="registry"
      @changed="loadUsers()"
    />
    <ModuleHost
      v-else-if="steps[current]"
      :env="env"
      :node="steps[current].node"
      :manifest="steps[current].manifest"
      :revision="revision"
      @mounted="loadUsers()"
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
