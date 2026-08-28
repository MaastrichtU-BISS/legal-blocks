<script setup lang="ts">
// A task, open. What it offers depends on who opened it.
//
// Two different jobs, so two different screens rather than one screen with
// parts missing:
//
//   an annotator came to work      -> their queue, and the way into it
//   whoever runs it came to look   -> where it stands, then the agreement
//
// The two rules that decide this are different on purpose. Agreement reports on
// everybody, so it is a question of authority and the manifest declares the
// role. Annotating is a question of having work: the owner is not assigned any
// documents, so there is no queue to show them. Withholding it by role would be
// the wrong reason, and would also hide it from somebody who runs the task and
// annotates in it too.

import { computed, ref, watch } from "vue";
import ModuleHost from "../runtime/ModuleHost.vue";
import type { ResolveEnv } from "../runtime/resolve";
import AnnotatorProgress from "./AnnotatorProgress.vue";
import TaskProgressPanel from "./TaskProgressPanel.vue";
import type { Manifest, Node } from "../types";
import { allowsRole } from "../types";
import type { TaskSummary } from "../api";

export interface TaskModule {
  node: Node;
  manifest: Manifest | undefined;
}

const props = defineProps<{
  task: TaskSummary;
  /** Every module in this platform that works on a task, unfiltered. */
  modules: TaskModule[];
  env: ResolveEnv;
  role: string;
}>();

const emit = defineEmits<{ changed: [] }>();

const step = ref(0);
const revision = ref(0);

/**
 * Where the annotate step should open, when somebody picked a document rather
 * than carrying on from the top. Cleared once used.
 */
const startPosition = ref<number | undefined>(undefined);

/** Somebody with documents of their own to work through in this task. */
const assigned = computed(() => props.task.annotators.some((a) => a.id === props.env.annotator));

const views = computed(() => {
  // Both identities start on Progress; what it shows is what differs.
  const out: { id: string; label: string; module?: TaskModule }[] = [
    { id: "progress", label: "Progress" },
  ];

  for (const m of props.modules) {
    const manifest = m.manifest;
    if (!manifest || !allowsRole(manifest, props.role)) continue;

    // Whether this module is where annotations get *made*, which is what needs
    // a queue and therefore an assignment.
    //
    // Not simply "outputs annotated-task@1": the metrics module outputs one
    // too, because it passes its input along so it can sit mid-chain. The one
    // that makes them is the one that does not take one to begin with — it
    // turns a corpus into an annotated task. Everything downstream is a view
    // over work that already exists.
    const consumes = (manifest.inputs ?? []).some((p) => p.type === "annotated-task@1");
    const makes = !consumes && (manifest.outputs ?? []).some((p) => p.type === "annotated-task@1");
    if (makes && !assigned.value) continue;

    out.push({ id: m.node.id, label: m.node.label || manifest.name || m.node.module, module: m });
  }
  return out;
});

// Back to the first view whenever who is looking changes. The two identities
// are offered different screens, so an index carried across from the other one
// means nothing — and past the end it renders nothing at all.
watch([() => props.role, () => props.env.annotator], () => {
  step.value = 0;
  startPosition.value = undefined;
});

const current = computed(() => views.value[step.value]);

/** The environment this task's steps run in, told which task is open. */
const taskEnv = computed<ResolveEnv>(() => ({
  ...props.env,
  taskId: Number(props.task.id),
  startPosition: startPosition.value,
  refresh: () => revision.value++,
  // The annotator saved their last document. Put them back where they can see
  // what they have done rather than leaving them on a spent queue. Progress is
  // always the first view, for both identities.
  finished: () => {
    step.value = 0;
    startPosition.value = undefined;
    revision.value++;
  },
}));

/** Opens the annotate view at a given queue position. */
function annotateAt(position: number) {
  const target = views.value.findIndex((v) => v.module);
  if (target < 0) return;
  startPosition.value = position;
  step.value = target;
  revision.value++;
}

function show(index: number) {
  step.value = index;
  revision.value++;
}
</script>

<template>
  <nav v-if="views.length > 1" class="steps">
    <button
      v-for="(v, i) in views"
      :key="v.id"
      :class="{ 'lw-primary': i === step }"
      @click="show(i)"
    >
      {{ v.label }}
    </button>
  </nav>

  <!-- The Progress view: the same tab showing two different things. -->
  <template v-if="current && !current.module">
    <TaskProgressPanel
      v-if="role === 'admin'"
      :task-id="Number(task.id)"
      :task-name="task.name"
      :revision="revision"
    />
    <AnnotatorProgress
      v-else
      :task-id="Number(task.id)"
      :annotator="env.annotator"
      :revision="revision"
      @open="annotateAt"
    />
  </template>

  <ModuleHost
    v-else-if="current?.module"
    :env="taskEnv"
    :node="current.module.node"
    :manifest="current.module.manifest as Manifest"
    :revision="revision"
    :instance-key="`${current.id}:${startPosition ?? 'resume'}`"
    @mounted="emit('changed')"
  />

  <!-- An annotator opening a task nobody assigned them. Better said than shown
       as an empty screen with a step bar above it. -->
  <p v-else class="lw-muted">
    You have nothing to do in this task — nobody has assigned you any documents in it.
  </p>
</template>

<style scoped>
.steps {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}
</style>
