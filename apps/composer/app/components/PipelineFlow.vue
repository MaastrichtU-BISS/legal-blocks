<script setup lang="ts">
// A pipeline is a line: each card reads what the one before it made, so they
// are drawn in order and joined by an arrow. It wraps, because a chain of six
// on a laptop is not one row.

import StepCard from "./StepCard.vue";
import type { Step } from "../composables/usePlatformDraft";

defineProps<{
  steps: Step[];
  selected: string | null;
  canRemove: (i: number) => boolean;
  whyNotRemove: (i: number) => string;
}>();

const emit = defineEmits<{ select: [id: string]; remove: [i: number] }>();
</script>

<template>
  <div class="flow">
    <template v-for="(step, i) in steps" :key="step.node.id">
      <StepCard
        :step="step"
        :selected="step.node.id === selected"
        :removable="canRemove(i)"
        :remove-title="canRemove(i) ? 'Remove this step' : whyNotRemove(i)"
        @select="emit('select', step.node.id)"
        @remove="emit('remove', i)"
      />
      <!-- The type is the reason these two can stand next to each other. -->
      <span
        v-if="i < steps.length - 1"
        class="arrow"
        :title="step.manifest?.outputs?.[0]?.type"
      >→</span>
    </template>
  </div>
</template>

<style scoped>
.flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.arrow {
  color: var(--muted);
  font-size: 1.2rem;
  user-select: none;
}
</style>
