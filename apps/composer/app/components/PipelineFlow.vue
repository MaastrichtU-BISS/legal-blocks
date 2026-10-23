<script setup lang="ts">
// A pipeline is a line: each card reads what the one before it made, so they
// are drawn in order and joined by an arrow. It wraps, because a chain of six
// on a laptop is not one row.

import { ref } from "vue";
import StepCard from "./StepCard.vue";
import SignInCard from "./SignInCard.vue";
import type { Step } from "../composables/usePlatformDraft";

defineProps<{
  steps: Step[];
  selected: string | null;
  /** Sign-in is always the first thing anyone meets, so it leads the line. */
  login: boolean;
  canRemove: (i: number) => boolean;
  whyNotRemove: (i: number) => string;
}>();

const emit = defineEmits<{ select: [id: string]; remove: [i: number]; removeLogin: []; reorder: [from: number, to: number] }>();

const dragFrom = ref<number | null>(null);
const dragOver = ref<number | null>(null);

function onDragStart(i: number, e: DragEvent) {
  dragFrom.value = i;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
  }
}
function onDragOver(i: number, e: DragEvent) {
  e.preventDefault();
  dragOver.value = i;
}
function onDrop(i: number) {
  if (dragFrom.value !== null && dragFrom.value !== i) {
    emit("reorder", dragFrom.value, i);
  }
  dragFrom.value = null;
  dragOver.value = null;
}
function onDragEnd() {
  dragFrom.value = null;
  dragOver.value = null;
}
</script>

<template>
  <div class="flow">
    <template v-if="login">
      <SignInCard @remove="emit('removeLogin')" />
      <span v-if="steps.length" class="arrow">→</span>
    </template>
    <template v-for="(step, i) in steps" :key="step.node.id">
      <div
        class="step-wrap"
        :class="{ dragging: dragFrom === i, 'drag-over': dragOver === i }"
        draggable="true"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver(i, $event)"
        @drop="onDrop(i)"
        @dragend="onDragEnd"
      >
        <StepCard
          :step="step"
          :selected="step.node.id === selected"
          :removable="canRemove(i)"
          :remove-title="canRemove(i) ? 'Remove this step' : whyNotRemove(i)"
          @select="emit('select', step.node.id)"
          @remove="emit('remove', i)"
        />
      </div>
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

.step-wrap {
  cursor: grab;
  transition: transform 120ms ease-out, opacity 120ms ease-out;
}

.step-wrap.dragging {
  opacity: 0.4;
  cursor: grabbing;
}

.step-wrap.drag-over {
  transform: scale(1.05);
}

.arrow {
  color: var(--accent-live);
  font-size: 1.2rem;
  user-select: none;
  font-family: var(--font-mono);
}
</style>

<style scoped>
.flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.arrow {
  color: var(--accent-live);
  font-size: 1.2rem;
  user-select: none;
  font-family: var(--font-mono);
}
</style>
