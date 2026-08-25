<script setup lang="ts">
// Renders a node's settings from its manifest's config schema. No module is
// named here — a new setting on any module appears automatically.

import type { ConfigField } from "@base/types";

defineProps<{ fields: ConfigField[]; modelValue: Record<string, unknown> }>();
const emit = defineEmits<{ "update:modelValue": [Record<string, unknown>] }>();

function set(current: Record<string, unknown>, key: string, value: unknown) {
  emit("update:modelValue", { ...current, [key]: value });
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
      <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
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

.help {
  margin: 0.25rem 0 0;
  font-size: 0.9em;
  line-height: 1.45;
}

.help a {
  color: var(--accent);
}
</style>
