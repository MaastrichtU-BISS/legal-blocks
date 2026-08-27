<script setup lang="ts">
// Where a task stands, for whoever is running it.
//
// Three cuts of one number, because one number does not answer the question.
// "18 of 40 started" says the task is half done; it does not say that one of
// three annotators has not begun, or that six documents nobody has opened are
// dragging the agreement figures. The per-annotator cut says who to chase, the
// per-document cut says what is ready to measure.
//
// "Started" rather than "finished" throughout: nothing in the schema records
// that somebody considers a document done, and a threshold invented here would
// put a number on screen that no other count in the platform agrees with.

import { ref, watch } from "vue";
import { getTaskProgress, type TaskProgress } from "../api";

const props = defineProps<{
  taskId: number;
  /** Bumped by the workspace after a step saves, so this re-reads. */
  revision: number;
}>();

const progress = ref<TaskProgress | null>(null);
const error = ref("");

watch(
  () => [props.taskId, props.revision],
  async () => {
    try {
      progress.value = await getTaskProgress(props.taskId);
      error.value = "";
    } catch (e) {
      // Worth saying rather than showing nothing: an empty panel where a
      // summary belongs reads as "no work done", which is a different claim.
      error.value = e instanceof Error ? e.message : String(e);
    }
  },
  { immediate: true },
);

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}
</script>

<template>
  <section v-if="error" class="tp tp-error">Could not load progress: {{ error }}</section>

  <section v-else-if="progress" class="tp">
    <header>
      <strong>{{ progress.done }} of {{ progress.total }}</strong>
      <span class="muted">document · annotator pairs started</span>
      <span class="bar" :title="`${pct(progress.done, progress.total)}%`">
        <span class="fill" :style="{ width: pct(progress.done, progress.total) + '%' }" />
      </span>
    </header>

    <div class="cuts">
      <div>
        <h4>By annotator</h4>
        <p v-for="row in progress.byAnnotator" :key="`a${row.id}`">
          <span class="who">{{ row.name }}</span>
          <span :class="['n', { none: row.done === 0, all: row.done === row.total }]">
            {{ row.done }} / {{ row.total }}
          </span>
        </p>
        <p v-if="!progress.byAnnotator.length" class="muted">Nobody is assigned yet.</p>
      </div>

      <div>
        <h4>By document</h4>
        <p v-for="row in progress.byDocument" :key="`d${row.id}`">
          <span class="who">{{ row.name }}</span>
          <span :class="['n', { none: row.done === 0, all: row.done === row.total }]">
            {{ row.done }} / {{ row.total }}
          </span>
        </p>
        <p v-if="!progress.byDocument.length" class="muted">No documents in this task.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tp {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  /* The panel is a summary, not the screen. A task with forty documents must
     not push the step it introduces below the fold. */
  max-height: 11rem;
  overflow-y: auto;
}

.tp-error {
  color: #b91c1c;
}

header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.bar {
  flex: 1;
  max-width: 12rem;
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
}

.fill {
  display: block;
  height: 100%;
  background: #1e4e79;
}

.cuts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.25rem 1.5rem;
}

h4 {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  margin: 0.25rem 0;
}

p {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin: 0.1rem 0;
}

.who {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.n {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Not started at all is the thing worth spotting from across the room. */
.none {
  color: #b91c1c;
}

.all {
  color: #16a34a;
}

.muted {
  color: #6b7280;
}
</style>
