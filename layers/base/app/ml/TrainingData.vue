<script setup lang="ts">
// What a model can be trained on: this person's Documents, like Annotate.
//
// The builder's own Datasets screen uploads a CSV straight to the ML service;
// here the data comes from the platform's Documents instead, so a table is
// imported once (Import documents, one document per row) and used by every
// tool. Choosing a dataset and what to learn sends it to the service.

import { computed, onMounted, ref } from "vue";
import type { MLAdapter } from "vue-legal-ml-builder";
import { removeTrainingSet } from "../api";
import RemoveButton from "../components/RemoveButton.vue";

interface DocumentTable {
  id: number;
  name: string;
  rows: number;
  columns: string[];
}

interface TaskType {
  value: string;
  label: string;
  summary?: string;
  required_columns?: string[];
}

interface TrainingSet {
  id: string;
  name: string;
  task_type: string;
  row_count?: number;
}

const props = defineProps<{ adapter: MLAdapter }>();
const emit = defineEmits<{ createModel: [datasetId: string] }>();

const tables = ref<DocumentTable[]>([]);
const taskTypes = ref<TaskType[]>([]);
const ready = ref<TrainingSet[]>([]);
const chosen = ref<Record<number, string>>({});
const sending = ref<number | null>(null);
const error = ref("");
const loading = ref(true);

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`);
  return body as T;
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [docs, types, sets] = await Promise.all([
      getJson<DocumentTable[]>("/api/services/ml/documents"),
      getJson<{ task_types: TaskType[] }>("/api/services/ml/datasets/task-types"),
      props.adapter.listDatasets() as Promise<unknown[]>,
    ]);
    tables.value = docs;
    taskTypes.value = types.task_types;
    ready.value = sets as TrainingSet[];
    for (const t of docs) chosen.value[t.id] ??= fitting(t)[0]?.value ?? "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** Task types whose required columns this table has. */
function fitting(table: DocumentTable): TaskType[] {
  const have = new Set(table.columns.map((c) => c.toLowerCase()));
  return taskTypes.value.filter((t) => (t.required_columns ?? ["text"]).every((c) => have.has(c.toLowerCase())));
}

const labelOf = computed(() => new Map(taskTypes.value.map((t) => [t.value, t.label])));

async function send(table: DocumentTable) {
  const taskType = chosen.value[table.id] ?? fitting(table)[0]?.value;
  if (!taskType) return;
  sending.value = table.id;
  error.value = "";
  try {
    const res = await fetch("/api/services/ml/datasets/from-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_id: table.id, task_type: taskType }),
    });
    const body = (await res.json().catch(() => ({}))) as { dataset?: TrainingSet; error?: string };
    if (!res.ok || !body.dataset) throw new Error(body.error ?? `could not use ${table.name} (${res.status})`);
    await load();
    emit("createModel", String(body.dataset.id));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    sending.value = null;
  }
}
</script>

<template>
  <div class="training-data">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">Loading your documents…</p>

    <template v-else>
      <section>
        <h3>Your documents</h3>
        <p class="muted">
          Models learn from the documents in this platform. Import a CSV in the Documents tab: one row per
          example, with a <code>text</code> column and, for classification, a <code>label</code> column.
        </p>

        <p v-if="!tables.length" class="empty">No documents yet. Add some in the Documents tab first.</p>

        <ul v-else class="tables">
          <li v-for="t in tables" :key="t.id">
            <div class="what">
              <strong>{{ t.name }}</strong>
              <span class="muted">{{ t.rows.toLocaleString() }} rows · columns: {{ t.columns.join(", ") }}</span>
            </div>
            <div class="how">
              <template v-if="fitting(t).length">
                <label class="sr-only" :for="`task-${t.id}`">What the model learns</label>
                <select :id="`task-${t.id}`" v-model="chosen[t.id]">
                  <option v-for="type in fitting(t)" :key="type.value" :value="type.value">
                    {{ type.label }}
                  </option>
                </select>
                <button
                  type="button"
                  class="vmlb-btn-primary"
                  :disabled="sending !== null"
                  @click="send(t)"
                >
                  {{ sending === t.id ? "Sending…" : "Train on these" }}
                </button>
              </template>
              <span v-else class="muted">Needs a label column (or summary, entities, judgment) to train on.</span>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="ready.length">
        <h3>Ready for training</h3>
        <ul class="tables">
          <li v-for="s in ready" :key="s.id">
            <div class="what">
              <strong>{{ s.name }}</strong>
              <span class="muted">
                {{ labelOf.get(s.task_type) ?? s.task_type }}<template v-if="s.row_count"> · {{ s.row_count.toLocaleString() }} rows</template>
              </span>
            </div>
            <div class="how">
              <button type="button" class="vmlb-btn-secondary" @click="emit('createModel', String(s.id))">
                Create model
              </button>
              <RemoveButton
                :name="s.name"
                consequence="the models trained on it"
                :remove="() => removeTrainingSet(String(s.id))"
                @removed="load"
              />
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.training-data {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

h3 {
  margin: 0;
  font-size: 1.05rem;
}

p {
  margin: 0;
}

.muted {
  color: var(--muted);
  font-size: 0.9rem;
}

.empty {
  padding: var(--space-md);
  border: 1px dashed var(--rule);
  border-radius: var(--radius-sm);
  color: var(--muted);
}

.error {
  color: var(--danger);
}

code {
  font-family: var(--font-mono);
  font-size: 0.85em;
}

.tables {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
}

.tables li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm) var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--rule);
}

.tables li:last-child {
  border-bottom: none;
}

.what {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.how {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
}

/* The builder's buttons put a margin above themselves for its own layout. */
.how button {
  margin-top: 0;
}

select {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--field-edge);
  border-radius: var(--radius-sm);
  background: var(--ground);
  color: var(--ink);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
