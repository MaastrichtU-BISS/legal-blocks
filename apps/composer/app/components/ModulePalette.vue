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
  padding: var(--space-md, 1rem);
  overflow: auto;
  background: var(--surface);
  border-right: 1px solid var(--rule);
  font-family: var(--font-body);
}

h2 {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: 0 0 var(--space-md, 0.8rem);
  font-weight: 500;
}

.module {
  margin-bottom: var(--space-md, 1rem);
  padding-bottom: var(--space-md, 0.9rem);
  border-bottom: 1px solid var(--rule);
}

.module:last-child {
  border-bottom: 0;
}

.module .row {
  gap: var(--space-sm, 0.5rem);
  align-items: center;
}

.module .row button {
  margin-left: auto;
  font-family: var(--font-body);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--radius-sm, 2px);
}

.module.on strong::after {
  content: " · on";
  color: var(--accent-live);
  font-weight: 500;
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.module p {
  margin: var(--space-xs, 0.2rem) 0 0;
  line-height: 1.45;
  font-size: 12px;
  color: var(--muted);
}

.ico {
  display: inline-flex;
  color: var(--muted);
}

.small {
  font-size: 0.9em;
}

strong {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 13px;
}
</style>
