<script setup lang="ts">
// Making a task: pick documents, pick labels, say who should do it.
//
// The three things a task is. Annotators are named by email because that is
// what somebody setting one up actually knows about the people who should do
// it — they may never have opened the platform, and resolving an address to a
// person is this platform's job.
//
// This lived in vue-legal-workspace until the workspace stopped being an
// annotation tool. It is here now because a task is an annotation idea, and
// the package that draws tabs and tables should not have one.

import { computed, ref } from "vue";
import { createTask } from "../api";
import type { DatasetSummary, LabelsetSummary } from "../api";

/** The granularities an annotator can work at. */
const LEVELS = ["word", "sentence", "paragraph", "character", "document"];

const props = defineProps<{
  datasets: DatasetSummary[];
  labelsets: LabelsetSummary[];
}>();

const emit = defineEmits<{ created: [id: number]; cancel: [] }>();

const name = ref("");
const datasetId = ref<number>(props.datasets[0]?.id ?? 0);
const labelsetId = ref<number>(props.labelsets[0]?.id ?? 0);
const level = ref<string>("word");
const guidelines = ref("");
const emails = ref("");
const saving = ref(false);
const error = ref("");

/** Addresses, however they were separated: commas, semicolons, newlines. */
const annotators = computed(() =>
  emails.value
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean),
);

const chosen = computed(() => props.datasets.find((d) => d.id === datasetId.value));
const ready = computed(
  () => datasetId.value > 0 && labelsetId.value > 0 && annotators.value.length > 0,
);

async function submit() {
  saving.value = true;
  error.value = "";
  try {
    const id = await createTask({
      name: name.value,
      dataset_id: datasetId.value,
      labelset_id: labelsetId.value,
      annotation_level: level.value,
      ann_guidelines: guidelines.value,
      annotators: annotators.value,
    });
    emit("created", id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="lw-form" @submit.prevent="submit">
    <label>
      Name
      <input v-model="name" placeholder="What this task is for" />
    </label>

    <label>
      Documents
      <select v-model.number="datasetId">
        <option v-for="d in datasets" :key="d.id" :value="d.id">
          {{ d.name }} ({{ d.documents }} documents)
        </option>
      </select>
    </label>

    <label>
      Labels
      <select v-model.number="labelsetId">
        <option v-for="l in labelsets" :key="l.id" :value="l.id">
          {{ l.name }} ({{ l.labels.length }} labels)
        </option>
      </select>
    </label>

    <label>
      Annotate by
      <select v-model="level">
        <option v-for="l in LEVELS" :key="l" :value="l">{{ l }}</option>
      </select>
    </label>

    <label>
      Guidelines link
      <input v-model="guidelines" placeholder="Optional — a page explaining the labels" />
    </label>

    <label>
      Annotators
      <textarea
        v-model="emails"
        rows="3"
        placeholder="anna@example.org, bram@example.org"
      ></textarea>
      <small class="lw-muted">
        Email addresses, separated however you like. They do not need an account here
        yet — but nothing is sent to them, so tell them yourself.
      </small>
    </label>

    <p v-if="ready" class="lw-muted lw-summary">
      {{ annotators.length }} × {{ chosen?.documents ?? 0 }} =
      {{ annotators.length * (chosen?.documents ?? 0) }} assignments. Everyone annotates
      every document, which is what makes agreement measurable.
    </p>

    <p v-if="error" class="lw-error">{{ error }}</p>

    <div class="lw-actions">
      <button type="submit" class="lw-primary" :disabled="!ready || saving">
        {{ saving ? "Creating…" : "Create task" }}
      </button>
      <button type="button" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
