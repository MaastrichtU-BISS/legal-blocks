<script setup lang="ts">
// A labelset: a name and the labels annotators can apply.
//
// One label per line rather than a repeating row of inputs. Labels usually
// arrive as a list somebody already has — in a guidelines document, in an
// email — and pasting that should work.

import { computed, ref } from "vue";
import { createLabelset } from "../api";

const emit = defineEmits<{ created: [id: number]; cancel: [] }>();

const name = ref("");
const desc = ref("");
const text = ref("");
const saving = ref(false);
const error = ref("");

const labels = computed(() =>
  text.value
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ name: l })),
);

const ready = computed(() => name.value.trim() !== "" && labels.value.length > 0);

async function submit() {
  saving.value = true;
  error.value = "";
  try {
    // Colours are left to the platform. Picking a dozen by hand is not what
    // anybody came here to do.
    const id = await createLabelset(name.value, desc.value, labels.value);
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
      <input v-model="name" placeholder="Obligations" />
    </label>

    <label>
      Description
      <input v-model="desc" placeholder="Optional" />
    </label>

    <label>
      Labels
      <textarea
        v-model="text"
        rows="6"
        placeholder="Obligation&#10;Right&#10;Prohibition"
      ></textarea>
      <small class="lw-muted">One per line, or separated by commas.</small>
    </label>

    <p v-if="labels.length" class="lw-muted lw-summary">
      {{ labels.length }} {{ labels.length === 1 ? "label" : "labels" }}:
      {{ labels.map((l) => l.name).join(", ") }}
    </p>

    <p v-if="error" class="lw-error">{{ error }}</p>

    <div class="lw-actions">
      <button type="submit" class="lw-primary" :disabled="!ready || saving">
        {{ saving ? "Saving…" : "Create labelset" }}
      </button>
      <button type="button" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
