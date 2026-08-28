<script setup lang="ts">
// An annotator's own progress through a task.
//
// The same idea as the owner's panel with the parts that are not theirs taken
// out: no annotator column, because the only annotator here is them, and no
// agreement, because that is a judgement about their work rather than a view
// of it.
//
// The queue is ordered and the order is the point — documents are given out in
// a sequence so that two annotators cover the corpus the same way. So this does
// not offer a free jump to any row. It offers:
//
//   * carry on from where you stopped, which is the ordinary path
//   * go back to anything already reached
//
// and nothing beyond that. Reaching document n is what opens 1..n-1: what has
// been seen can be revisited, what has not been reached yet cannot be jumped
// to.

import { computed, ref, watch } from "vue";
import { getQueue, type QueueEntry } from "../api";

const props = defineProps<{
  taskId: number;
  annotator: number;
  /** Bumped by the workspace after a save, so this re-reads. */
  revision: number;
}>();

/** Positions are 1-based, as the annotation package counts them. */
const emit = defineEmits<{ open: [position: number] }>();

const entries = ref<QueueEntry[]>([]);
const error = ref("");

watch(
  () => [props.taskId, props.annotator, props.revision],
  async () => {
    try {
      entries.value = await getQueue(props.taskId, props.annotator);
      error.value = "";
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  },
  { immediate: true },
);

const finished = computed(() => entries.value.filter((e) => e.status === "done").length);
const allDone = computed(() => entries.value.length > 0 && finished.value === entries.value.length);

/**
 * The first document not yet finished — where "continue" goes.
 *
 * Falls back to the last one when everything is finished, so the button still
 * leads somewhere rather than disappearing at the moment somebody wants to
 * check their last answer.
 */
const nextPosition = computed(() => {
  const i = entries.value.findIndex((e) => e.status !== "done");
  return i === -1 ? Math.max(entries.value.length - 1, 0) : i;
});

/**
 * How far along the queue anyone may go: the next unfinished document.
 *
 * Everything before it has been reached, so it can be revisited. Everything
 * after it has not, and opening one would be skipping.
 */
const frontier = computed(() => nextPosition.value);

function isReachable(index: number): boolean {
  return index <= frontier.value;
}

function label(entry: QueueEntry, index: number): { text: string; cls: string } {
  if (entry.status === "done") return { text: "Done", cls: "all" };
  if (index === frontier.value) return { text: "Up next", cls: "some" };
  return { text: "Locked", cls: "none" };
}
</script>

<template>
  <section class="ap">
    <p v-if="error" class="ap-error">{{ error }}</p>

    <header>
      <span :class="['badge', allDone ? 'all' : finished ? 'some' : 'none']">
        {{ allDone ? "Done" : finished ? "Working on it" : "Not started" }}
      </span>
      <strong>{{ finished }} of {{ entries.length }}</strong>
      <span class="muted">documents finished</span>
      <button v-if="entries.length" class="go" @click="emit('open', nextPosition + 1)">
        {{ allDone ? "Review your work" : finished ? "Continue annotating" : "Start annotating" }}
      </button>
    </header>

    <p v-if="!entries.length && !error" class="muted">
      Nobody has assigned you any documents in this task.
    </p>

    <div v-else class="docs">
      <p v-for="(entry, i) in entries" :key="entry.assignment_id" class="row">
        <span class="pos">{{ i + 1 }}</span>
        <span class="who">{{ entry.name }}</span>
        <span :class="['badge', label(entry, i).cls]">{{ label(entry, i).text }}</span>

        <!-- Anything reached opens. The rest say why not. -->
        <button v-if="isReachable(i)" class="open" @click="emit('open', i + 1)">
          {{ entry.status === "done" ? "Review" : "Annotate" }}
        </button>
        <span v-else class="muted small">after the ones above</span>
      </p>
    </div>
  </section>
</template>

<style scoped>
.ap {
  max-width: 40rem;
  font-size: 0.85rem;
}

.ap-error {
  color: #b91c1c;
}

header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-bottom: 0.5rem;
  margin-bottom: 0.25rem;
  border-bottom: 1px solid #e5e7eb;
}

.go {
  font: inherit;
  font-size: 0.8rem;
  margin-left: auto;
  padding: 0.25rem 0.7rem;
  border: 1px solid #1e4e79;
  border-radius: 4px;
  background: #1e4e79;
  color: #fff;
  cursor: pointer;
}

.docs {
  max-height: 22rem;
  overflow-y: auto;
}

.row {
  display: grid;
  grid-template-columns: 1.5rem 1fr auto auto;
  align-items: center;
  gap: 0.5rem;
  margin: 0.2rem 0;
}

.pos {
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.who {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  color: #9ca3af;
}

.open {
  font: inherit;
  font-size: 0.78rem;
  padding: 0.12rem 0.5rem;
  border: 1px solid #1e4e79;
  border-radius: 4px;
  background: #fff;
  color: #1e4e79;
  cursor: pointer;
}

.muted {
  color: #6b7280;
}

.small {
  font-size: 0.75rem;
}
</style>
