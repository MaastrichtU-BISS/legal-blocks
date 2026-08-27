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
 * What the current identity is allowed to see.
 *
 * A pipeline has no accounts, so everyone running one is the person who built
 * it and there is nothing to withhold. In a workspace the platform's own
 * account is an admin and everybody added to a task is an annotator.
 */
const role = computed(() =>
  kind.value === "pipeline"
    ? "admin"
    : (users.value.find((u) => u.id === annotator.value)?.role ?? "annotator"),
);

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

// The order they are written in is the order they run: the pipeline is a list
// and a step reads what the step before it produced.
const steps = computed(() =>
  props.pipeline.nodes.map((node) => ({
    node,
    manifest: props.registry.modules[node.module],
  })),
);

const current = ref(0);
const hasNext = computed(() => current.value < steps.value.length - 1);

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
  produced: (nodeId) => onProduced(nodeId),
}));

/**
 * A step has produced its output.
 *
 * In a pipeline that is the cue to open the step which reads it — the search
 * returned, so show what it found, rather than leaving somebody looking at a
 * finished form wondering which tab to press. Only the step on screen may
 * advance the pipeline: a background refresh finishing on a step nobody is
 * looking at should not move anyone.
 *
 * Steps with no natural finish — annotating is never "done" — never call this,
 * and are moved on from with Next instead.
 */
function onProduced(nodeId: string) {
  if (kind.value !== "pipeline") return;
  if (steps.value[current.value]?.node.id !== nodeId) return;
  if (!hasNext.value) return;
  goTo(current.value + 1);
}

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

      <!-- Steps that produce something move on by themselves; this is for the
           ones that never finish, like annotating. -->
      <button v-if="kind === 'pipeline' && hasNext" class="primary" @click="goTo(current + 1)">
        Next →
      </button>

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
      :role="role"
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
