<script setup lang="ts">
// Get full text: turns judgments a search found into documents with their
// text, which is what annotation works on.
//
// A visible step rather than a conversion on the edge, because it is work:
// one request per batch of judgments, and some have no published text. The
// person running it sees how many, which ones were missing, and why.

import { computed, ref } from "vue";
import type { FullText } from "../api";

interface Found {
  ecli: string;
  dataset?: string;
  summary?: string;
}

const props = defineProps<{
  /** What the search found, read again whenever the search changes. */
  results: () => Found[];
  /** At most this many judgments are fetched. */
  limit: number;
  fetch: (batch: { ecli: string; dataset?: string }[]) => Promise<FullText[]>;
  /** Keeps the documents: for the next step, or as a stored dataset. */
  keep: (documents: { name: string; source: string; full_text: string }[]) => Promise<void>;
  /** "Use these documents" in a session, "Save as documents" when stored. */
  keepLabel: string;
}>();

const BATCH = 10;

const found = computed(() => props.results());
const toFetch = computed(() => found.value.slice(0, Math.max(1, props.limit)));

const fetched = ref<FullText[]>([]);
const fetching = ref(false);
const kept = ref(false);
const error = ref("");

const withText = computed(() => fetched.value.filter((d) => d.text));
const missing = computed(() => fetched.value.filter((d) => !d.text));

async function run() {
  fetching.value = true;
  kept.value = false;
  error.value = "";
  fetched.value = [];
  try {
    for (let i = 0; i < toFetch.value.length; i += BATCH) {
      const batch = toFetch.value.slice(i, i + BATCH).map(({ ecli, dataset }) => ({ ecli, dataset }));
      fetched.value = [...fetched.value, ...(await props.fetch(batch))];
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    fetching.value = false;
  }
}

async function keepThem() {
  error.value = "";
  try {
    await props.keep(
      withText.value.map((d) => ({ name: d.ecli, source: d.ecli, full_text: d.text! })),
    );
    kept.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <section class="full-text">
    <p v-if="!found.length" class="muted">
      Search first. The judgments it finds appear here, and this step fetches their full text.
    </p>

    <template v-else>
      <div class="head">
        <p>
          The search found <strong>{{ found.length }}</strong>
          {{ found.length === 1 ? "judgment" : "judgments" }}.
          <span v-if="found.length > toFetch.length" class="muted">
            The first {{ toFetch.length }} will be fetched.
          </span>
        </p>
        <button type="button" class="action" :disabled="fetching" @click="run">
          {{ fetching ? `Fetching ${fetched.length} of ${toFetch.length}…` : `Get full text (${toFetch.length})` }}
        </button>
      </div>

      <div v-if="fetched.length" class="outcome" role="status">
        <p>
          <strong>{{ withText.length }}</strong> with text<template v-if="missing.length">,
          <strong>{{ missing.length }}</strong> without</template>.
        </p>
        <ul class="list">
          <li v-for="d in fetched" :key="d.ecli" :class="{ none: !d.text }">
            <span class="mono">{{ d.ecli }}</span>
            <span v-if="d.text" class="muted">{{ d.text.length.toLocaleString() }} characters</span>
            <span v-else class="muted">no text: {{ d.message || "not published" }}</span>
          </li>
        </ul>
        <div class="foot">
          <button
            type="button"
            class="action primary"
            :disabled="fetching || !withText.length || kept"
            @click="keepThem"
          >
            {{ kept ? "Done" : `${keepLabel} (${withText.length})` }}
          </button>
        </div>
      </div>
    </template>

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<style scoped>
.full-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
  color: var(--ink);
  font-family: var(--font-body);
}

.head,
.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

p {
  margin: 0;
}

.muted {
  color: var(--muted);
}

.mono {
  font-family: var(--font-mono);
  font-size: 0.85em;
}

.outcome {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 16rem;
  overflow-y: auto;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
}

.list li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-xs) var(--space-md);
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid var(--rule);
  font-size: 0.875rem;
}

.list li:last-child {
  border-bottom: none;
}

.list li.none .mono {
  color: var(--muted);
}

.action {
  font: inherit;
  font-weight: 600;
  font-size: 0.875rem;
  padding: var(--space-sm) 20px;
  border: 1px solid var(--accent-interactive);
  border-radius: var(--radius-sm);
  background: var(--ground);
  color: var(--accent-interactive);
  cursor: pointer;
}

.action.primary {
  background: var(--accent-interactive);
  color: var(--on-accent);
}

/* Stated on hover too: inside the workspace shell its own button hover
   would otherwise paint teal text over the teal fill. */
.full-text .action:hover:not(:disabled) {
  border-color: var(--accent-interactive);
  background: var(--surface);
  color: var(--accent-interactive);
}

.full-text .action.primary:hover:not(:disabled) {
  background: var(--accent-interactive);
  color: var(--on-accent);
  filter: brightness(1.08);
}

.action:disabled {
  border-color: var(--disabled-fill);
  background: var(--disabled-fill);
  color: var(--disabled-ink);
  cursor: not-allowed;
}

.action:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.error {
  color: var(--danger);
}
</style>
