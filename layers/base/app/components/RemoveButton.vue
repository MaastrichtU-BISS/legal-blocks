<script setup lang="ts">
// Removing one thing, asked twice.
//
// The first press only asks, beside the row, saying what else goes with it;
// the second removes. It knows nothing about what it removes: the caller
// passes the call, and hears `removed` when it worked.

import { nextTick, ref } from "vue";

const props = defineProps<{
  /** What the row is called, for the question and for screen readers. */
  name: string;
  /** What goes with it, such as "its 960 documents". */
  consequence?: string;
  /** Why it cannot be removed now. Asking shows this instead of the question. */
  blocked?: string;
  remove: () => Promise<void>;
}>();
const emit = defineEmits<{ removed: [] }>();

const asking = ref(false);
const busy = ref(false);
const error = ref("");
const keep = ref<HTMLButtonElement | null>(null);

async function ask() {
  error.value = "";
  asking.value = true;
  await nextTick();
  keep.value?.focus();
}

async function confirm() {
  busy.value = true;
  error.value = "";
  try {
    await props.remove();
    asking.value = false;
    emit("removed");
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- Inside a row that opens on click: nothing here may open it. -->
  <span class="lb-remove lb-ui" @click.stop @keydown.stop>
    <button v-if="!asking" type="button" class="lb-remove-btn" :aria-label="`Remove ${name}`" @click="ask">
      Remove
    </button>
    <span v-else-if="blocked" class="lb-remove-question" role="group" :aria-label="`Remove ${name}`">
      <span class="lb-remove-what">{{ blocked }}</span>
      <button ref="keep" type="button" class="lb-remove-btn" @click="asking = false">OK</button>
    </span>
    <span v-else class="lb-remove-question" role="group" :aria-label="`Remove ${name}?`">
      <span class="lb-remove-what">Remove “{{ name }}”<template v-if="consequence"> and {{ consequence }}</template>?</span>
      <button type="button" class="lb-remove-btn lb-remove-yes" :disabled="busy" @click="confirm">
        {{ busy ? "Removing…" : "Remove" }}
      </button>
      <button ref="keep" type="button" class="lb-remove-btn" :disabled="busy" @click="asking = false">Keep</button>
    </span>
    <span v-if="error" class="lb-remove-error" role="alert">{{ error }}</span>
  </span>
</template>

<style>
/* Not scoped, and every button selector doubles its class: the workspace
   shell styles `.lw button` and, in dark mode, `html.dark .lw button:hover`,
   more specifically than a scoped rule could, and this sits inside it. */
.lb-remove {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-xs);
  text-align: end;
}

.lb-remove-question {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-xs) var(--space-sm);
}

/* Table cells in the workspace do not wrap; a question or a refusal must. */
.lb-remove-what,
.lb-remove-error {
  white-space: normal;
}

.lb-remove-what {
  font-size: 0.85rem;
  color: var(--ink);
}

.lb-remove .lb-remove-btn.lb-remove-btn {
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0;
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--ground);
  color: var(--muted);
  cursor: pointer;
}

.lb-remove .lb-remove-btn.lb-remove-btn:hover:not(:disabled) {
  border-color: var(--danger);
  background: var(--ground);
  color: var(--danger);
}

.lb-remove .lb-remove-btn.lb-remove-yes,
.lb-remove .lb-remove-btn.lb-remove-yes:hover:not(:disabled) {
  border-color: var(--danger);
  background: var(--danger);
  color: var(--on-accent);
}

.lb-remove .lb-remove-btn.lb-remove-btn:disabled {
  border-color: transparent;
  background: var(--disabled-fill);
  color: var(--disabled-ink);
  cursor: not-allowed;
}

.lb-remove .lb-remove-btn.lb-remove-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.lb-remove-error {
  font-size: 0.85rem;
  color: var(--danger);
  max-width: 36ch;
}
</style>
