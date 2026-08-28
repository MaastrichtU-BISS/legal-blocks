<script setup lang="ts">
// One module on the board. The same card in both layouts, so a step looks like
// a step whether it is in a line or on a ring.

import ModuleIcon from "./ModuleIcon.vue";
import type { Step } from "../composables/usePlatformDraft";

defineProps<{
  step: Step;
  selected: boolean;
  /** False when closing this one would break what is left. */
  removable?: boolean;
  removeTitle?: string;
}>();

const emit = defineEmits<{ select: []; remove: [] }>();
</script>

<template>
  <div class="card" :class="{ selected }" @click="emit('select')">
    <button
      class="close"
      :disabled="removable === false"
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
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.card:hover {
  border-color: var(--accent);
}

.card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.card strong {
  font-size: 0.9rem;
  line-height: 1.2;
}

.ico {
  display: inline-flex;
  color: var(--accent);
}

.small {
  font-size: 0.9em;
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
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
}

.card:hover .close,
.card.selected .close,
.close:focus-visible {
  opacity: 1;
}

.close:hover:not(:disabled) {
  background: var(--border);
  color: #b91c1c;
}

.close:disabled {
  cursor: default;
  opacity: 0.35;
}
</style>
