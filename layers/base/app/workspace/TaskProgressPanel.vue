<script setup lang="ts">
// Where a task stands, for whoever is running it.
//
// Three cuts of one number, because one number does not answer the question.
// "18 of 40 started" says the task is half done; it does not say that one of
// three annotators has not begun, or that six documents nobody has opened are
// dragging the agreement figures. The per-annotator cut says who to chase, the
// per-document cut says what is ready to measure.

import { computed, ref, watch } from "vue";
import { downloadTask, getTaskProgress, type ProgressRow, type TaskProgress } from "../api";

const props = defineProps<{
  taskId: number;
  taskName: string;
  /** Bumped by the workspace after a step saves, so this re-reads. */
  revision: number;
}>();

const progress = ref<TaskProgress | null>(null);
const error = ref("");
const downloading = ref(false);

// A corpus can be hundreds of documents, and the per-annotator cut is the one
// somebody opens this for. Documents are the detail underneath it.
const showDocuments = ref(false);

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

/**
 * What state a row — or the whole task — is in.
 *
 * Three states rather than a percentage, because the question being asked is
 * "can I look at this yet". Finished is what agreement can be computed over;
 * anything less is in flight.
 */
function state(row: { done: number; finished: number; total: number }) {
  if (row.total === 0) return { label: "Empty", cls: "none" };
  if (row.finished === row.total) return { label: "Done", cls: "all" };
  if (row.done > 0) return { label: "Working on it", cls: "some" };
  return { label: "Not started", cls: "none" };
}

const overall = computed(() => (progress.value ? state(progress.value) : null));

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Documents nobody has touched, which is what the collapsed row should say. */
const untouched = computed(
  () => progress.value?.byDocument.filter((d) => d.done === 0).length ?? 0,
);

function rowTitle(row: ProgressRow): string {
  return `${row.done} of ${row.total} started, ${row.finished} finished`;
}

async function download() {
  downloading.value = true;
  try {
    await downloadTask(props.taskId, props.taskName);
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <section class="tp">
    <p v-if="error" class="tp-error">{{ error }}</p>

    <template v-if="progress">
      <header>
        <span v-if="overall" :class="['badge', overall.cls]">{{ overall.label }}</span>
        <strong>{{ progress.done }} of {{ progress.total }}</strong>
        <span class="muted">started · {{ progress.finished }} finished</span>
        <span class="bar" :title="`${pct(progress.done, progress.total)}% started`">
          <span class="fill" :style="{ width: pct(progress.done, progress.total) + '%' }" />
        </span>
        <button class="dl" :disabled="downloading" @click="download">
          {{ downloading ? "Preparing…" : "Download task" }}
        </button>
      </header>

      <h4>By annotator</h4>
      <p v-for="row in progress.byAnnotator" :key="`a${row.id}`" class="row">
        <span class="who">{{ row.name }}</span>
        <span :class="['badge', state(row).cls]">{{ state(row).label }}</span>
        <span class="n" :title="rowTitle(row)">{{ row.done }} / {{ row.total }}</span>
      </p>
      <p v-if="!progress.byAnnotator.length" class="muted">Nobody is assigned yet.</p>

      <!-- Collapsed by default: a task over three hundred documents would bury
           everything above it, and the annotators are the actionable cut. -->
      <button class="disclose" :aria-expanded="showDocuments" @click="showDocuments = !showDocuments">
        {{ showDocuments ? "▾" : "▸" }} By document ({{ progress.byDocument.length }}<template
          v-if="untouched"
        >, {{ untouched }} not started</template>)
      </button>

      <div v-if="showDocuments" class="docs">
        <p v-for="row in progress.byDocument" :key="`d${row.id}`" class="row">
          <span class="who">{{ row.name }}</span>
          <span :class="['badge', state(row).cls]">{{ state(row).label }}</span>
          <span class="n" :title="rowTitle(row)">{{ row.done }} / {{ row.total }}</span>
        </p>
        <p v-if="!progress.byDocument.length" class="muted">No documents in this task.</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.tp {
  /* A summary is read down, not across. Left-aligned rather than centred so it
     lines up with the step bar above it. */
  max-width: 40rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
}

.tp-error {
  color: #b91c1c;
  margin: 0 0 0.4rem;
}

header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}

.bar {
  flex: 1;
  min-width: 4rem;
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

.dl {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.dl:hover:not(:disabled) {
  border-color: #9ca3af;
}

.dl:disabled {
  opacity: 0.55;
  cursor: default;
}

h4 {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  margin: 0.5rem 0 0.25rem;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.6rem;
  margin: 0.15rem 0;
}

.who {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.n {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: #6b7280;
  min-width: 3.2rem;
  text-align: right;
}

.badge {
  font-size: 0.7rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  white-space: nowrap;
  border: 1px solid currentColor;
}

.badge.all {
  color: #15803d;
}

.badge.some {
  color: #b45309;
}

.badge.none {
  color: #6b7280;
}

.disclose {
  font: inherit;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  background: none;
  border: 0;
  padding: 0.5rem 0 0.25rem;
  cursor: pointer;
}

.disclose:hover {
  color: #1f2937;
}

/* Bounded so a long corpus scrolls here rather than pushing the step below the
   fold — the panel introduces the screen, it is not the screen. */
.docs {
  max-height: 14rem;
  overflow-y: auto;
}

.muted {
  color: #6b7280;
  margin: 0.15rem 0;
}
</style>
