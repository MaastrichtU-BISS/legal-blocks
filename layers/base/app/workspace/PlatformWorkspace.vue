<script setup lang="ts">
// This platform's workspace.
//
// vue-legal-workspace draws tabs and tables and knows nothing else. This says
// what the tabs are, what goes in each modal, and what opening a row means —
// which is where everything annotation-shaped lives, and where the pipeline
// reappears.
//
// The tabs are computed rather than fixed, so a workspace offers exactly what
// it was composed to do. No module that brings documents in, no button to add
// them. No module that works on a task, no Tasks tab and no Labels tab either,
// because a labelset with nothing to apply it to is furniture.
//
// The composer decides which modules exist. The people using the platform
// decide which tasks. Neither knows about the other, and this file is where
// they meet.

import { computed, ref } from "vue";
import { LegalWorkspace } from "vue-legal-workspace";
import type { Row, WorkspaceTab } from "vue-legal-workspace";
import "vue-legal-workspace/style.css";

import ModuleHost from "../runtime/ModuleHost.vue";
import type { ResolveEnv } from "../runtime/resolve";
import type { Manifest, Pipeline, Registry } from "../types";
import type { DatasetSummary, LabelsetSummary, TaskSummary } from "../api";
import { getDatasets, getLabelsets, getTasks } from "../api";
import NewLabelsetForm from "./NewLabelsetForm.vue";
import OpenTask from "./OpenTask.vue";
import NewTaskForm from "./NewTaskForm.vue";

const props = defineProps<{
  env: ResolveEnv;
  pipeline: Pipeline;
  registry: Registry;
  /** What the current identity may see. See Runtime.vue. */
  role: string;
}>();
const emit = defineEmits<{ changed: [] }>();

/** The modules that bring documents in: import, search, whatever comes next. */
const sources = computed(() =>
  props.pipeline.nodes
    .map((node) => ({ node, manifest: props.registry.modules[node.module] }))
    .filter((s) => s.manifest?.kind === "source"),
);

/**
 * The modules that work on a task: annotating it, reporting agreement on it,
 * taking the results out. A module qualifies by speaking annotated-task@1,
 * which is the same declaration the composer uses to decide what may connect
 * to what — so nothing here names a module.
 *
 * Deliberately not filtered by who is looking. Whether this platform has tasks
 * at all is a property of what it was composed from, and a Tasks tab that
 * disappears for its owner because they cannot open one of its steps would be
 * a workspace that forgets what it is.
 */
const taskModules = computed(() =>
  props.pipeline.nodes
    .map((node) => ({ node, manifest: props.registry.modules[node.module] }))
    .filter(({ manifest }) => {
      if (!manifest || manifest.kind === "source") return false;
      return [...(manifest.inputs ?? []), ...(manifest.outputs ?? [])].some(
        (p) => p.type === "annotated-task@1",
      );
    }),
);

// Kept here as well as fetched by their tabs, because the Tasks tab has to
// know whether there is anything to make a task from before either of the
// other two has ever been opened.
const datasets = ref<DatasetSummary[]>([]);
const labelsets = ref<LabelsetSummary[]>([]);

async function listDatasets(): Promise<DatasetSummary[]> {
  datasets.value = await getDatasets();
  return datasets.value;
}

async function listLabelsets(): Promise<LabelsetSummary[]> {
  labelsets.value = await getLabelsets();
  return labelsets.value;
}

void listDatasets();
void listLabelsets();

/** Why a task cannot be made yet, named precisely enough to act on. */
const taskBlocked = computed(() => {
  const missing: string[] = [];
  if (!datasets.value.length) missing.push("documents");
  if (!labelsets.value.length) missing.push("labels");
  if (!missing.length) return undefined;
  return `A task needs documents and labels — add ${missing.join(" and ")} first.`;
});

const tabs = computed<WorkspaceTab[]>(() => {
  const out: WorkspaceTab[] = [
    {
      id: "datasets",
      label: "Documents",
      columns: [
        { key: "name", label: "Name" },
        { key: "documents", label: "Documents", align: "end" },
        { key: "task_count", label: "Tasks", align: "end" },
      ],
      list: listDatasets,
      // No module brings documents in, so there is nothing to press.
      createLabel: sources.value.length ? "Add documents" : undefined,
      createTitle: "Add documents",
      empty: "No documents yet. Everything else here is made from these.",
    },
  ];

  if (!taskModules.value.length) return out;

  out.push(
    {
      id: "labelsets",
      label: "Labels",
      columns: [
        { key: "name", label: "Name" },
        { key: "labels", label: "Labels" },
        { key: "task_count", label: "Tasks", align: "end" },
      ],
      list: listLabelsets,
      createLabel: "New labelset",
      createTitle: "New labelset",
      empty: "No labelsets yet. A labelset is what annotators can apply.",
    },
    {
      id: "tasks",
      label: "Tasks",
      columns: [
        { key: "name", label: "Name" },
        { key: "dataset_name", label: "Documents" },
        { key: "labelset_name", label: "Labels" },
        { key: "annotation_level", label: "By" },
        { key: "annotators", label: "Annotators", align: "end" },
        { key: "progress", label: "Progress", align: "end" },
      ],
      list: getTasks,
      createLabel: "New task",
      createTitle: "New task",
      createBlocked: taskBlocked.value,
      openable: true,
      openLabel: "See",
      empty: "No tasks yet. Make one and give it to somebody.",
    },
  );

  return out;
});

/**
 * What the documents about to be uploaded will be called.
 *
 * The workspace cannot ask this: it does not know a dataset is made from
 * files, which is the whole reason making one is a slot. So the name is asked
 * for here, next to the thing that produces the documents, and handed to the
 * source module through its config.
 */
const datasetName = ref("");
const defaultName = () => `Documents ${new Date().toISOString().slice(0, 10)}`;

// Remounts the upload module after a dataset is made, so the drop zone comes
// back empty rather than still showing the files that were just stored.
const uploadRevision = ref(0);

/** The source module's context, with the name the person just typed. */
function sourceEnv(): ResolveEnv {
  return { ...props.env, datasetName: datasetName.value.trim() || defaultName() };
}

function progress(row: Row): string {
  const t = row as TaskSummary;
  if (t.total === 0) return "no documents";
  if (t.done === t.total) return "complete";
  return `${t.done} of ${t.total}`;
}

function created() {
  datasetName.value = "";
  uploadRevision.value++;
  void listDatasets();
  void listLabelsets();
  emit("changed");
}
</script>

<template>
  <LegalWorkspace :tabs="tabs" tab="tasks" @created="created">
    <!-- However this platform gets documents. Usually one module; a platform
         built with both upload and search shows both. -->
    <template #create-datasets="{ done }">
      <label class="name">
        Call these documents
        <input v-model="datasetName" :placeholder="defaultName()" />
      </label>

      <div v-for="s in sources" :key="s.node.id" class="pane">
        <h3>{{ s.node.label || s.manifest?.name }}</h3>
        <ModuleHost
          :env="sourceEnv()"
          :node="s.node"
          :manifest="s.manifest as Manifest"
          :revision="uploadRevision"
          @mounted="void 0"
        />
      </div>

      <!-- A source module saves as it goes and has no way to say it finished,
           so this is the only thing that can. -->
      <div class="lw-actions">
        <button class="lw-primary" @click="done">Done</button>
      </div>
    </template>

    <template #create-labelsets="{ done, close }">
      <NewLabelsetForm @created="done" @cancel="close" />
    </template>

    <template #create-tasks="{ done, close }">
      <NewTaskForm
        :datasets="datasets"
        :labelsets="labelsets"
        @created="done"
        @cancel="close"
      />
    </template>

    <!-- Labels read better as themselves than as a list of names. -->
    <template #cell-labelsets-labels="{ item }">
      <span class="lw-chips">
        <span
          v-for="label in (item as LabelsetSummary).labels"
          :key="label.name"
          class="lw-chip"
          :style="label.color ? { background: label.color, color: '#fff' } : undefined"
        >
          {{ label.name }}
        </span>
      </span>
    </template>

    <template #cell-tasks-annotators="{ item }">
      {{ (item as TaskSummary).annotators.length }}
    </template>

    <template #cell-tasks-progress="{ item }">
      {{ progress(item) }}
    </template>

    <!-- A task, open. What it offers depends on who opened it — see OpenTask. -->
    <template #open-tasks="{ item }">
      <OpenTask
        :task="item as TaskSummary"
        :modules="taskModules"
        :env="env"
        :role="role"
        @changed="emit('changed')"
      />
    </template>
  </LegalWorkspace>
</template>

<style scoped>
.pane {
  margin-bottom: 1rem;
  width: 100%;
}

.name {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
  max-width: 24rem;
  margin-bottom: 1rem;
}

.name input {
  font: inherit;
  padding: 0.35rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

h3 {
  font-size: 0.95rem;
  margin: 0 0 0.5rem;
}

.steps {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}
</style>
