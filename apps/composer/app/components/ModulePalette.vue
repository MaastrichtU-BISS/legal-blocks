<script setup lang="ts">
// Everything that can go into a platform, with storage at the top.
//
// Storage is first because it changes what everything under it means: which
// modules are offered, whether they connect, and what the middle of the screen
// draws. Sign-in comes next. Neither is a registry module — they have no
// package and nothing to mount; they are capabilities the platform provides.

import ModuleIcon from "./ModuleIcon.vue";
import type { Manifest } from "@legal-blocks/manifest";

defineProps<{
  modules: Manifest[];
  stored: boolean;
  login: boolean;
  canAppend: (m: Manifest) => boolean;
  whyNot: (m: Manifest) => string;
}>();

const emit = defineEmits<{ add: [m: Manifest]; toggleStorage: []; toggleLogin: [] }>();
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
        A place people come back to. They bring in documents, define labels, create tasks and
        hand them to others, and their work is kept between visits. Without this the platform
        is a one-off run: work stays in the browser and leaves through a download.
      </p>
    </div>

    <div class="module" :class="{ on: login }">
      <div class="row">
        <span class="ico"><ModuleIcon name="user" /></span>
        <strong>Sign-in</strong>
        <button :class="{ primary: !login }" @click="emit('toggleLogin')">
          {{ login ? "Remove" : "Add" }}
        </button>
      </div>
      <p class="muted small">
        People create an account with their email and a password before they can use the
        platform. Whoever creates the first account owns it.
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
