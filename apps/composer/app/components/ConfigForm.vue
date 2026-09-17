<script setup lang="ts">
// Renders a node's settings from its manifest's config schema. No module is
// named here — a new setting on any module appears automatically.

import { reactive } from "vue";
import type { ConfigField } from "@base/types";

defineProps<{ fields: ConfigField[]; modelValue: Record<string, unknown> }>();
const emit = defineEmits<{ "update:modelValue": [Record<string, unknown>] }>();

function set(current: Record<string, unknown>, key: string, value: unknown) {
  emit("update:modelValue", { ...current, [key]: value });
}

/** Why the last file picked for a field was refused, by field key. */
const fileProblems = reactive<Record<string, string>>({});

/**
 * Reads a picked .json file into the field as text.
 *
 * Checked here rather than at export: the platform refuses a structure that is
 * not JSON, and finding that out after downloading and starting it is a much
 * longer loop than being told next to the button.
 */
async function readJsonFile(current: Record<string, unknown>, key: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  const text = await file.text();
  try {
    JSON.parse(text);
  } catch (e) {
    fileProblems[key] = `${file.name} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }
  delete fileProblems[key];
  set(current, key, text);
}

/** A one-line description of an uploaded structure, for next to the button. */
function describeJson(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") return "No file uploaded.";
  try {
    const goals = (JSON.parse(value) as { goals?: unknown[] }).goals;
    return Array.isArray(goals)
      ? `Structure loaded: ${goals.length} goal${goals.length === 1 ? "" : "s"}.`
      : "File loaded.";
  } catch {
    return "The stored file is not valid JSON — upload it again.";
  }
}
</script>

<template>
  <p v-if="fields.length === 0" class="muted">This step has nothing to configure.</p>

  <div v-for="field in fields" :key="field.key" class="field">
    <label :for="field.key">{{ field.label }}</label>

    <select
      v-if="field.type === 'select'"
      :id="field.key"
      :value="modelValue[field.key]"
      @change="set(modelValue, field.key, ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="option in field.options" :key="option" :value="option">
        {{ field.optionLabels?.[option] ?? option }}
      </option>
    </select>

    <input
      v-else-if="field.type === 'number'"
      :id="field.key"
      type="number"
      min="1"
      :value="modelValue[field.key]"
      @input="set(modelValue, field.key, Number(($event.target as HTMLInputElement).value))"
    />

    <textarea
      v-else-if="field.type === 'labelset'"
      :id="field.key"
      rows="3"
      :value="String(modelValue[field.key] ?? '')"
      @input="set(modelValue, field.key, ($event.target as HTMLTextAreaElement).value)"
    ></textarea>

    <div v-else-if="field.type === 'json'" class="upload">
      <input
        :id="field.key"
        type="file"
        accept=".json,application/json"
        @change="readJsonFile(modelValue, field.key, $event)"
      />
      <p class="muted help">
        {{ describeJson(modelValue[field.key]) }}
        <button
          v-if="String(modelValue[field.key] ?? '') !== ''"
          type="button"
          class="link"
          @click="set(modelValue, field.key, '')"
        >
          Remove
        </button>
      </p>
      <p v-if="fileProblems[field.key]" class="error help">{{ fileProblems[field.key] }}</p>
    </div>

    <input
      v-else-if="field.type === 'secret'"
      :id="field.key"
      type="password"
      autocomplete="off"
      spellcheck="false"
      :value="String(modelValue[field.key] ?? '')"
      @input="set(modelValue, field.key, ($event.target as HTMLInputElement).value)"
    />

    <input
      v-else
      :id="field.key"
      type="text"
      :value="String(modelValue[field.key] ?? '')"
      @input="set(modelValue, field.key, ($event.target as HTMLInputElement).value)"
    />

    <p v-if="field.link" class="help">
      <a :href="field.link" target="_blank" rel="noreferrer noopener">
        {{ field.linkText || "Where to get this" }} ↗
      </a>
    </p>
    <p v-if="field.help" class="muted help">{{ field.help }}</p>
  </div>
</template>

<style scoped>
.field {
  margin-bottom: 0.9rem;
}

label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
}

.upload input[type="file"] {
  max-width: 100%;
  font-size: 0.9em;
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.help {
  margin: 0.25rem 0 0;
  font-size: 0.9em;
  line-height: 1.45;
}

.help a {
  color: var(--accent);
}
</style>
