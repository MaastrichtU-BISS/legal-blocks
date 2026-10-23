<script setup lang="ts">
// One module on the board. The same card in both layouts, so a step looks like
// a step whether it is in a line or on a ring.

import ModuleIcon from "./ModuleIcon.vue";
import type { Step } from "../composables/usePlatformDraft";

// removable defaults to true explicitly: Vue turns an omitted boolean prop into
// false, which left every card on the workspace ring with a disabled ×.
withDefaults(
  defineProps<{
    step: Step;
    selected: boolean;
    /** False when closing this one would break what is left. */
    removable?: boolean;
    removeTitle?: string;
  }>(),
  { removable: true },
);

const emit = defineEmits<{ select: []; remove: [] }>();
</script>

<template>
  <div class="card" :class="{ selected }" @click="emit('select')">
    <button
      class="close"
      :disabled="!removable"
      :title="removeTitle ?? 'Remove'"
      @click.stop="emit('remove')"
    >
      ×
    </button>
    <span class="ico"><ModuleIcon :name="step.manifest?.icon" :size="26" /></span>
    <strong>{{ step.node.label }}</strong>
    <span class="muted small">{{ step.manifest?.id }}</span>
  </div>
</template>

<style scoped>
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
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 8px);
  background: var(--surface);
  cursor: pointer;
  font-family: var(--font-body);
  font-weight: 600;
  box-shadow: 0 2px 6px rgb(31 41 55 / 0.06);
  transition: transform 120ms ease-out, box-shadow 120ms ease-out, border-color 120ms ease-out;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgb(31 41 55 / 0.1);
  border-color: var(--accent-live);
}

.card.selected {
  border-color: var(--accent-live);
  box-shadow: 0 2px 8px rgb(232 90 79 / 0.2);
  background: var(--accent-live);
  color: #fff;
}

.card strong {
  font-size: 0.9rem;
  line-height: 1.2;
  font-family: var(--font-display);
  font-weight: 600;
}

.ico {
  display: inline-flex;
  color: var(--accent-interactive);
}

.small {
  font-size: 0.9em;
  font-family: var(--font-mono);
  color: var(--muted);
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
  border-radius: var(--radius-full, 9999px);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  font-family: var(--font-body);
}

.card:hover .close,
.card.selected .close,
.close:focus-visible {
  opacity: 1;
}

.close:hover:not(:disabled) {
  background: var(--rule);
  color: var(--danger);
}

.close:disabled {
  cursor: default;
  opacity: 0.35;
}
</style>
