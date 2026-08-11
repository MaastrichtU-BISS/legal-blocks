<script setup lang="ts">
// The one module that ships inside the platform rather than as an npm package.
// It stands in for the import package: when that exists it becomes another
// module producing the same corpus@1 type, and nothing downstream changes.
import type { CorpusDocument } from "../types";

defineProps<{ documents: CorpusDocument[] }>();
</script>

<template>
  <div class="pad">
    <p v-if="documents.length === 0" class="muted">
      No documents yet. Put <code>.txt</code> files in the platform's
      <code>corpus</code> folder and reload this page.
    </p>

    <template v-else>
      <p class="muted">
        {{ documents.length }} document{{ documents.length === 1 ? "" : "s" }} loaded from the
        <code>corpus</code> folder. Add or remove files there and reload to change this.
      </p>
      <ul class="docs">
        <li v-for="doc in documents" :key="doc.name">
          <strong>{{ doc.name }}</strong>
          <span class="muted"> · {{ doc.full_text.length.toLocaleString() }} characters</span>
          <p class="preview">{{ doc.full_text.slice(0, 240) }}…</p>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.docs {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
}

.docs li {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.6rem 0.8rem;
  margin-bottom: 0.5rem;
}

.preview {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.9em;
  line-height: 1.5;
}
</style>
