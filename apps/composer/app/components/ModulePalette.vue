<script setup lang="ts">
// Everything that can go into a platform, with storage at the top.
//
// Storage is first because it changes what everything under it means: which
// modules are offered, whether they connect, and what the middle of the screen
// draws. It is not a registry module — it has no package and nothing to mount,
// it is the one capability the platform itself provides.

import ModuleIcon from "./ModuleIcon.vue";
import type { Manifest } from "@base/types";

defineProps<{
  modules: Manifest[];
  stored: boolean;
  canAppend: (m: Manifest) => boolean;
  whyNot: (m: Manifest) => string;
}>();

const emit = defineEmits<{ add: [m: Manifest]; toggleStorage: [] }>();
</script>

<template>
  <section class="palette">
    <h2>Available</h2>

    <div class="module" :class="{ on: stored }">
      <div class="row">
        <span class="ico"><ModuleIcon name="database" /></span>
        <strong>Workspace</strong>
        <button :class="{ primary: !stored }" @click="emit('toggleStorage')">
          {{ stored ? "Remove" : "Add" }}
        </button>
      </div>
      <p class="muted small">
        Gives the platform a database. Whoever uses it makes their own documents, labels and
        tasks, everything is saved as they go, and several people can share it. Without this
        the platform keeps nothing: work stays in the browser for one session and leaves
        through a download.
      </p>
    </div>

    <div v-for="m in modules" :key="m.id" class="module">
      <div class="row">
        <span class="ico"><ModuleIcon :name="m.icon" /></span>
        <strong>{{ m.name }}</strong>
        <button :disabled="!canAppend(m)" :title="canAppend(m) ? '' : whyNot(m)" @click="emit('add', m)">
          Add
        </button>
      </div>
      <p class="muted small">{{ m.description }}</p>
    </div>
  </section>
</template>

<style scoped>
.palette {
  padding: 1rem;
  overflow: auto;
  background: var(--bg-soft);
  border-right: 1px solid var(--border);
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

/* Storage on: say so here, since it governs everything under it. */
.module.on strong::after {
  content: " · on";
  color: var(--accent);
  font-weight: 500;
}

.ico {
  display: inline-flex;
  color: var(--muted);
}

.small {
  font-size: 0.9em;
}
</style>
