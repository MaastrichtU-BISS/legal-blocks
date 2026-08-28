<script setup lang="ts">
// A workspace is a ring: nothing flows between the tools, they all read from
// and write to the same store. A line would be claiming a connection that does
// not exist, so the store sits in the middle and every card reaches it.
//
// The arrows are double-headed for the same reason — each tool both reads and
// writes, and a single head would be telling half the truth.

import ModuleIcon from "./ModuleIcon.vue";
import StepCard from "./StepCard.vue";
import type { Step } from "../composables/usePlatformDraft";

defineProps<{ steps: Step[]; selected: string | null }>();
const emit = defineEmits<{ select: [id: string]; remove: [i: number] }>();

/** How far out the cards sit, as a percentage of the board. */
const RING = 34;

function angleOf(index: number, total: number): number {
  return (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
}

/** Where a card sits. Percentages, so it holds at any width. */
function ringStyle(index: number, total: number): Record<string, string> {
  const a = angleOf(index, total);
  return { left: `${50 + RING * Math.cos(a)}%`, top: `${50 + RING * Math.sin(a)}%` };
}

/** The line out to one card, stopped short of the store and of the card. */
function spoke(index: number, total: number): Record<string, number> {
  const a = angleOf(index, total);
  const inner = 9;
  const outer = RING - 8;
  return {
    x1: 50 + inner * Math.cos(a),
    y1: 50 + inner * Math.sin(a),
    x2: 50 + outer * Math.cos(a),
    y2: 50 + outer * Math.sin(a),
  };
}
</script>

<template>
  <div class="ring">
    <svg class="spokes" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <!-- One marker at both ends: orient="auto-start-reverse" is exactly the
             instruction to flip it at the start, so a second mirrored marker
             only un-flips it again. -->
        <marker
          id="lb-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="4"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M0 1 L7 4 L0 7 z" fill="currentColor" />
        </marker>
      </defs>
      <line
        v-for="(step, i) in steps"
        :key="step.node.id"
        v-bind="spoke(i, steps.length)"
        class="spoke"
      />
    </svg>

    <div class="store" title="Everything is saved here">
      <ModuleIcon name="database" :size="30" />
      <span class="small">Database</span>
    </div>

    <StepCard
      v-for="(step, i) in steps"
      :key="step.node.id"
      class="on-ring"
      :style="ringStyle(i, steps.length)"
      :step="step"
      :selected="step.node.id === selected"
      remove-title="Remove this tool"
      @select="emit('select', step.node.id)"
      @remove="emit('remove', i)"
    />
  </div>
</template>

<style scoped>
.ring {
  position: relative;
  width: 100%;
  /* Square, so the ring is a ring rather than an ellipse. */
  aspect-ratio: 1 / 1;
  max-width: 40rem;
  min-height: 26rem;
  margin: 0 auto;
}

.spokes {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.spoke {
  stroke: var(--border);
  stroke-width: 0.5;
  marker-start: url(#lb-arrow);
  marker-end: url(#lb-arrow);
}

.store {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  width: 7rem;
  height: 7rem;
  border: 1px solid var(--accent);
  border-radius: 50%;
  background: #fff;
  color: var(--accent);
}

.on-ring {
  position: absolute;
  transform: translate(-50%, -50%);
}

.small {
  font-size: 0.9em;
}
</style>
