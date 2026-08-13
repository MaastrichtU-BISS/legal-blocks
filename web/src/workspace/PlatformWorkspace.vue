<script setup lang="ts">
// This platform's workspace.
//
// vue-legal-workspace owns the screens; this owns what they are wired to. The
// source is four reads and two writes against the platform's own API, and the
// two slots are where the pipeline reappears: whatever this platform brings
// documents in with, and whatever it can do with a task once one is open.
//
// The composer decides which modules exist. The people using the platform
// decide which tasks. Neither knows about the other, and this file is the
// twenty lines where they meet.

import { computed, ref } from "vue";
import { LegalWorkspace } from "vue-legal-workspace";
import type { Task, WorkspaceSource } from "vue-legal-workspace";
import "vue-legal-workspace/style.css";

import ModuleHost from "../runtime/ModuleHost.vue";
import type { ResolveEnv } from "../runtime/resolve";
import type { Manifest, Pipeline, Registry } from "../types";
import { createLabelset, createTask, getDatasets, getLabelsets, getTasks } from "../api";

const props = defineProps<{ env: ResolveEnv; pipeline: Pipeline; registry: Registry }>();
const emit = defineEmits<{ changed: [] }>();

const source: WorkspaceSource = {
  listTasks: getTasks,
  createTask,
  listDatasets: getDatasets,
  listLabelsets: getLabelsets,
  createLabelset,
};

/** The modules that bring documents in: import, search, whatever comes next. */
const sources = computed(() =>
  props.pipeline.nodes
    .map((node) => ({ node, manifest: props.registry.modules[node.module] }))
    .filter((s) => s.manifest?.kind === "source"),
);

/**
 * The steps that work on a task: annotating it, reporting agreement on it,
 * taking the results out. A module qualifies by speaking annotated-task@1,
 * which is the same declaration the composer uses to decide what may connect
 * to what — so nothing here names a module.
 */
const taskSteps = computed(() =>
  props.pipeline.nodes
    .map((node) => ({ node, manifest: props.registry.modules[node.module] }))
    .filter(({ manifest }) => {
      if (!manifest || manifest.kind === "source") return false;
      return [...(manifest.inputs ?? []), ...(manifest.outputs ?? [])].some(
        (p) => p.type === "annotated-task@1",
      );
    }),
);

const step = ref(0);
const revision = ref(0);

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

/** The source module's context, with the name the person just typed. */
function sourceEnv(): ResolveEnv {
  return { ...props.env, datasetName: datasetName.value.trim() || defaultName() };
}

/** The environment those steps run in, told which task is open. */
function taskEnv(task: Task): ResolveEnv {
  return { ...props.env, taskId: task.id, refresh: () => revision.value++ };
}
</script>

<template>
  <LegalWorkspace :source="source" :can-create-datasets="sources.length > 0" @task-created="emit('changed')">
    <!-- However this platform gets documents. Usually one module; a platform
         built with both upload and search shows both. -->
    <template #new-dataset>
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
          :revision="revision"
          @mounted="void 0"
        />
      </div>
    </template>

    <!-- A task, open. The pipeline's own steps, scoped to it. -->
    <template #task="{ task }">
      <nav v-if="taskSteps.length > 1" class="steps">
        <button
          v-for="(s, i) in taskSteps"
          :key="s.node.id"
          :class="{ 'lw-primary': i === step }"
          @click="step = i; revision++"
        >
          {{ s.node.label || s.manifest?.name }}
        </button>
      </nav>

      <p v-if="!taskSteps.length" class="lw-muted">
        This platform has no step that works on a task. Add an annotation step
        to the pipeline and export it again.
      </p>
      <ModuleHost
        v-else
        :env="taskEnv(task)"
        :node="taskSteps[step].node"
        :manifest="taskSteps[step].manifest as Manifest"
        :revision="revision"
        @mounted="void 0"
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
