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
  <!-- The whole card is one button, so a keyboard user can reach and choose
       a step; the × stays a separate button beside it, never inside it. -->
  <div class="card" :class="{ selected }">
    <button
      type="button"
      class="pick"
      :aria-pressed="selected"
      @click="emit('select')"
    >
      <span class="ico"><ModuleIcon :name="step.manifest?.icon" :size="26" /></span>
      <strong>{{ step.node.label }}</strong>
      <span class="muted small">{{ step.manifest?.id }}</span>
    </button>
    <button
      type="button"
      class="close"
      :disabled="!removable"
      :title="removeTitle ?? 'Remove'"
      :aria-label="removeTitle ?? 'Remove'"
      @click.stop="emit('remove')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  width: 9.5rem;
  min-height: 6.5rem;
  display: flex;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 8px);
  background: var(--surface);
  cursor: pointer;
  font-family: var(--font-body);
  font-weight: 600;
  box-shadow: 0 1px 2px var(--shadow-soft);
  transition: transform 120ms ease-out, border-color 120ms ease-out;
}

/* DESIGN.md: nodes lift 1px on hover; the chosen one takes a coral border
   and a 1px ring, never a coral fill under text. */
/* Reset the shell's button look: the card draws the frame. */
.lb-ui .card .pick {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  text-align: center;
  padding: 0.9rem 0.6rem;
  border: 0;
  border-radius: inherit;
  background: transparent;
  box-shadow: none;
  color: inherit;
  font-weight: 600;
  transform: none;
}

.lb-ui .card .pick:hover:not(:disabled) {
  color: inherit;
}

.card:hover {
  transform: translateY(-1px);
  border-color: var(--accent-interactive);
}

.card.selected {
  border-color: var(--accent-live);
  box-shadow: 0 0 0 1px var(--accent-live);
  background: var(--ground);
}

@media (prefers-reduced-motion: reduce) {
  .card:hover {
    transform: none;
  }
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
  font-size: 0.8125rem;
  font-weight: 500;
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
.card:focus-within .close,
.close:focus-visible {
  opacity: 1;
}

.close:hover:not(:disabled) {
  background: var(--rule);
  color: var(--danger);
}

.close:disabled {
  cursor: not-allowed;
  background: var(--disabled-fill);
  color: var(--disabled-ink);
}
</style>
