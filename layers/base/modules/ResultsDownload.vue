<script setup lang="ts">
// How work leaves a platform that stores nothing.
//
// With a database the annotations are already kept and shareable; without one
// the browser is the only place they exist, so the platform needs an explicit
// way to take them out. That asymmetry is why this module is ephemeral-only.

import { computed } from "vue";
import type { TaskData } from "legal-annotation-kit";

const props = defineProps<{ task: TaskData }>();

const stats = computed(() => {
  let spans = 0;
  let tags = 0;
  let done = 0;
  const annotators = new Set<number>();
  for (const doc of props.task.documents) {
    for (const a of doc.assignments) {
      annotators.add(a.annotator);
      spans += a.annotations.length;
      tags += a.document_annotations.length;
      if (a.status === "done") done++;
    }
  }
  return {
    documents: props.task.documents.length,
    annotators: annotators.size,
    spans,
    tags,
    done,
    total: props.task.documents.length * annotators.size,
  };
});

function download() {
  const blob = new Blob([JSON.stringify(props.task, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${props.task.name || "annotations"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="pad lb-ui">
    <h2>{{ task.name }}</h2>

    <dl>
      <div><dt>Documents</dt><dd>{{ stats.documents }}</dd></div>
      <div><dt>Annotators</dt><dd>{{ stats.annotators }}</dd></div>
      <div><dt>Finished</dt><dd>{{ stats.done }} of {{ stats.total }}</dd></div>
      <div><dt>Annotations</dt><dd>{{ stats.spans }}</dd></div>
      <div v-if="stats.tags"><dt>Document tags</dt><dd>{{ stats.tags }}</dd></div>
    </dl>

    <button class="primary" @click="download">Download annotations (JSON)</button>

    <p class="muted note">
      This platform keeps nothing on a server. Your work is held in this browser
      and will be lost if you clear its data, so download it when you are done.
    </p>
  </div>
</template>

<style scoped>
h2 {
  margin: 0 0 1rem;
  font-size: 1.1rem;
}

dl {
  margin: 0 0 1.2rem;
  display: grid;
  gap: 0.3rem;
  max-width: 22rem;
}

dl > div {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.3rem;
}

dt {
  color: var(--muted);
}

dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.note {
  margin-top: 1rem;
  max-width: 34rem;
  line-height: 1.5;
}
</style>
