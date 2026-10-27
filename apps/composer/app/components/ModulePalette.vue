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
        <span v-if="m.storage" class="db-badge" title="Stores data in the database when persistent storage is on">
          <ModuleIcon name="database" :size="12" /> db
        </span>
        <button :disabled="!canAppend(m)" :title="canAppend(m) ? '' : whyNot(m)" @click="emit('add', m)">
          Add
        </button>
      </div>
      <p v-if="!canAppend(m)" class="hint small">{{ whyNot(m) }}</p>
      <p class="muted small">{{ m.description }}</p>
    </div>
  </section>
</template>

<style scoped>
.palette {
  padding: var(--space-md, 1rem);
  overflow: auto;
  background: var(--surface);
  border-right: 2px solid var(--ink);
  font-family: var(--font-body);
}

h2 {
  font-family: var(--font-display);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink);
  margin: 0 0 var(--space-md, 0.8rem);
  font-weight: 800;
}

.module {
  margin-bottom: var(--space-md, 1rem);
  padding-bottom: var(--space-md, 0.9rem);
  border-bottom: 2px solid var(--rule);
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
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--radius-sm, 8px);
  border: 1px solid var(--rule);
  background: var(--accent-interactive);
  color: #fff;
}

.module.on strong::after {
  content: " · on";
  color: var(--accent-live);
  font-weight: 800;
  font-family: var(--font-display);
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
  color: var(--accent-interactive);
}

.db-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 8px);
  padding: 1px 6px;
}

.hint {
  margin: 0.2rem 0 0;
  font-size: 11px;
  color: var(--accent-live);
  font-family: var(--font-mono);
  line-height: 1.4;
}

.small {
  font-size: 0.9em;
}

strong {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  color: var(--ink);
}
</style>
