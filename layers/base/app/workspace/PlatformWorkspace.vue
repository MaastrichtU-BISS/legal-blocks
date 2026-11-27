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
import type { Row } from "vue-legal-workspace";
import "vue-legal-workspace/style.css";

import ModuleHost from "../runtime/ModuleHost.vue";
import type { ResolveEnv } from "../runtime/resolve";
import type { Manifest, Pipeline, Registry } from "@legal-blocks/manifest";
import type { DatasetSummary, LabelsetSummary, MlModelSummary, TaskSummary } from "../api";
import { getDatasets, getLabelsets, getMlModels, getTasks, signedInId } from "../api";
import RemoveButton from "../components/RemoveButton.vue";
import NewLabelsetForm from "./NewLabelsetForm.vue";
import { REMOVE_COLUMN, withRemoval, type RemovableTab } from "./removal";
import { datasetRemoval, labelsetRemoval, modelRemoval, taskRemoval } from "./removals";
import OpenTask from "./OpenTask.vue";
import NewTaskForm from "./NewTaskForm.vue";

const props = defineProps<{
  env: ResolveEnv;
  pipeline: Pipeline;
  registry: Registry;
  /** The current person's address, for adding themselves to a task. */
  me?: string;
}>();
const emit = defineEmits<{ changed: [] }>();

/** The modules that bring documents in: import, search, whatever comes next. */
const sources = computed(() =>
  props.pipeline.nodes
    .map((node) => ({ node, manifest: props.registry.modules[node.module] }))
    .filter((s) => s.manifest?.kind === "source"),
);

/**
 * Steps that turn what a source found into documents: Get full text, after a
 * search. They read no task and are not sources themselves, so they sit in the
 * same window as the sources, below them.
 */
const preparers = computed(() =>
  props.pipeline.nodes
    .map((node) => ({ node, manifest: props.registry.modules[node.module] }))
    .filter(
      ({ manifest }) =>
        manifest?.kind !== "source" &&
        (manifest?.inputs ?? []).some((p) => p.required) &&
        (manifest?.outputs ?? []).some((p) => p.type === "corpus@1"),
    ),
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

/**
 * The modules that train models. A module qualifies by calling the ML
 * service, the same declaration that puts that service in the export.
 */
const mlModules = computed(() =>
  props.pipeline.nodes
    .map((node) => ({ node, manifest: props.registry.modules[node.module] }))
    .filter(({ manifest }) => manifest?.services?.includes("ml")),
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

// Everybody may make documents, labels and tasks; the platform lists each
// person only their own.
void listDatasets();
void listLabelsets();

/** Why a task cannot be made yet, named precisely enough to act on. */
const taskBlocked = computed(() => {
  const missing: string[] = [];
  if (!datasets.value.length) missing.push("documents");
  if (!labelsets.value.length) missing.push("labels");
  if (!missing.length) return undefined;
  return `A task needs documents and labels: add ${missing.join(" and ")} first.`;
});

const me = ref<number | undefined>();
void signedInId().then((id) => (me.value = id));

const tasksTab = computed<RemovableTab>(() => withRemoval({
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
  empty: "No tasks yet. Make one and give it to somebody, or wait to be given one.",
}, taskRemoval(() => me.value)));

/** Only the signed-in person's: the platform signs each request for them. */
const modelsTab = withRemoval({
  id: "models",
  label: "Models",
  columns: [
    { key: "name", label: "Name" },
    { key: "model_type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "accuracy", label: "Accuracy", align: "end" },
  ],
  list: getMlModels,
  createLabel: "Train a model",
  createTitle: "Train a model",
  openable: true,
  openLabel: "Open",
  empty: "No models yet. Import a labelled CSV in Documents, then train one on it.",
}, modelRemoval);

/**
 * The tab a workspace opens on: its tasks when it has any, else its models,
 * so an ML classroom does not open on an empty Documents tab.
 */
const firstTab = computed(() =>
  taskModules.value.length ? "tasks" : mlModules.value.length ? "models" : "datasets",
);

/** The ML module's context, opened at one model. */
function modelEnv(row: Row): ResolveEnv {
  return { ...props.env, itemId: String((row as MlModelSummary).id) };
}

function accuracy(row: Row): string {
  const value = (row as MlModelSummary).metrics?.accuracy;
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "–";
}

const tabs = computed<RemovableTab[]>(() => {
  const out: RemovableTab[] = [
    withRemoval({
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
    }, datasetRemoval),
  ];

  if (mlModules.value.length) out.push(modelsTab);

  if (!taskModules.value.length) return out;

  out.push(
    withRemoval({
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
    }, labelsetRemoval),
    tasksTab.value,
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

const workspace = ref<{ reload(): void } | null>(null);
const removable = computed(() => tabs.value.filter((t) => t.removal));

function removed() {
  workspace.value?.reload();
  void listDatasets();
  void listLabelsets();
  emit("changed");
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
  <LegalWorkspace ref="workspace" :tabs="tabs" :tab="firstTab" @created="created">
    <!-- Every tab that allows removing gets the same button in its last column. -->
    <template v-for="t in removable" :key="t.id" #[`cell-${t.id}-${REMOVE_COLUMN}`]="{ item }">
      <RemoveButton
        v-if="t.removal!.allowed?.(item) ?? true"
        :name="t.removal!.name(item)"
        :consequence="t.removal!.consequence?.(item)"
        :blocked="t.removal!.blocked?.(item)"
        :remove="() => t.removal!.remove(item)"
        @removed="removed"
      />
    </template>

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

      <div v-for="p in preparers" :key="p.node.id" class="pane">
        <h3>{{ p.node.label || p.manifest?.name }}</h3>
        <ModuleHost
          :env="sourceEnv()"
          :node="p.node"
          :manifest="p.manifest as Manifest"
          :revision="uploadRevision"
        />
      </div>

      <!-- A source module saves as it goes and has no way to say it finished,
           so this is the only thing that can. -->
      <div class="lw-actions">
        <button class="lw-primary" @click="done">Done</button>
      </div>
    </template>

    <!-- The ML workbench, whole: upload, train, try a model. Closing it
         reloads the tab, so a model trained in there shows up here. -->
    <template #create-models>
      <div v-for="m in mlModules" :key="m.node.id" class="pane">
        <ModuleHost :env="env" :node="m.node" :manifest="m.manifest as Manifest" :revision="0" />
      </div>
    </template>

    <!-- One model, opened: its scores and a box to try it on new text. -->
    <template #open-models="{ item }">
      <div v-for="m in mlModules" :key="m.node.id" class="pane">
        <ModuleHost
          :env="modelEnv(item)"
          :node="m.node"
          :manifest="m.manifest as Manifest"
          :revision="0"
          :instance-key="(item as MlModelSummary).id"
        />
      </div>
    </template>

    <template #cell-models-accuracy="{ item }">
      {{ accuracy(item) }}
    </template>

    <template #create-labelsets="{ done, close }">
      <NewLabelsetForm @created="done" @cancel="close" />
    </template>

    <template #create-tasks="{ done, close }">
      <NewTaskForm
        :datasets="datasets"
        :labelsets="labelsets"
        :me="me"
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
          :style="label.color ? { background: label.color, color: 'var(--label-ink)' } : undefined"
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
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 2px);
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

<!-- vue-legal-workspace ships its own blue; re-point the actions and focus
     ring at the platform's accents so the runtime and composer read as one
     product (DESIGN.md). Unscoped on purpose: the targets live inside the
     package's own markup, so a scoped selector would never match, and the
     html-prefix outranks the package's .lw rules regardless of load order. -->
<style>
/* Light surface tokens come from the package; dark comes from the platform
   theme, which the package knows nothing about. Re-paint its light-coded
   surfaces with the theme variables. */
html .lw .lw-primary,
html .lw .lw-on {
  background: var(--accent-live-fill);
  border-color: var(--accent-live-fill);
  color: var(--on-accent);
}

html .lw .lw-primary:hover:not(:disabled),
html .lw .lw-on:hover:not(:disabled) {
  background: var(--accent-live-fill-hover);
  border-color: var(--accent-live-fill-hover);
  color: var(--on-accent);
}

html .lw .lw-primary:disabled {
  background: var(--disabled-fill);
  border-color: var(--disabled-fill);
  color: var(--disabled-ink);
  cursor: not-allowed;
}

/* The package centres its list at --lw-max-width but leaves the tab strip
   at the left edge, so on a wide screen the tabs and the content they
   switch sat 250px apart. Put the tabs in the same column. */
html .lw .lw-tabs {
  width: 100%;
  max-width: var(--lw-max-width, 64rem);
  margin-inline: auto;
}

/* Table heads in the body face, sentence case, untracked (DESIGN.md). */
html .lw-table th {
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.8125rem;
}

html .lw-table tbody tr.lw-click:focus-visible {
  outline-color: var(--accent-interactive);
}

html.dark .lw {
  background: var(--ground);
  color: var(--ink);
}

html.dark .lw .lw-muted {
  color: var(--muted);
}

html.dark .lw button {
  background: var(--surface);
  border-color: var(--rule);
  color: var(--ink);
}

html.dark .lw button:hover:not(:disabled) {
  border-color: var(--accent-interactive);
  color: var(--accent-interactive);
}

html.dark .lw .lw-primary,
html.dark .lw .lw-on {
  background: var(--accent-live-fill);
  border-color: var(--accent-live-fill);
  color: var(--on-accent);
}


html.dark .lw h2 {
  color: var(--ink);
  text-wrap: balance;
}

html.dark .lw-table th,
html.dark .lw-table td {
  border-color: var(--rule);
}

html.dark .lw-table th,
html.dark .lw-table .lw-end,
html.dark .lw .lw-open-btn {
  color: var(--muted);
}

html.dark .lw-table tbody tr.lw-click:hover td,
html.dark .lw-table tbody tr.lw-click:focus-visible td {
  background: var(--surface);
}

html.dark .lw-chip {
  background: var(--rule);
  color: var(--ink);
}

html.dark .lw-modal {
  background: var(--surface);
  color: var(--ink);
}

/* On a phone the row holding the tab's name and its "needs documents and
   labels" notice shares one flex line and gets cramped; stack it. */
@media (max-width: 600px) {
  html .lw-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
}
</style>
