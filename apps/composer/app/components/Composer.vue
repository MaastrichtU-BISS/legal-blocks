<script setup lang="ts">
// The composer: pick modules, arrange them, export.
//
// This file is the shell. What may go into a platform lives in
// usePlatformDraft; how it looks lives in the components beside it. Keeping the
// rules out of the screens is what makes them followable by reading: "can this
// module be added" is a question about a platform, not about a column.

import { computed, ref, toRef } from "vue";
import ConfigForm from "./ConfigForm.vue";
import ModulePalette from "./ModulePalette.vue";
import PipelineFlow from "./PipelineFlow.vue";
import WorkspaceRing from "./WorkspaceRing.vue";
import { usePlatformDraft } from "../composables/usePlatformDraft";
import { exportPipeline } from "@base/api";
import type { Registry } from "@base/types";
import { fieldAppliesIn } from "@base/types";

const props = defineProps<{ registry: Registry }>();

const {
  pipeline,
  selected,
  problem,
  kind,
  stored,
  steps,
  canAppend,
  whyNot,
  append,
  canRemove,
  whyNotRemove,
  remove,
  toggleStorage,
  startOver,
} = usePlatformDraft(toRef(props, "registry"));

const status = ref("");

const modules = computed(() =>
  Object.values(props.registry.modules).sort((a, b) => a.name.localeCompare(b.name)),
);

const selectedStep = computed(() => steps.value.find((s) => s.node.id === selected.value));

/** Settings the composer owns in this mode; the rest belong to runtime users. */
const settingsFields = computed(() =>
  (selectedStep.value?.manifest?.config ?? []).filter((f) => fieldAppliesIn(f, kind.value)),
);

async function doExport() {
  problem.value = "";
  status.value = "Building…";
  try {
    await exportPipeline(pipeline.value);
    status.value = "Downloaded.";
  } catch (e) {
    problem.value = e instanceof Error ? e.message : String(e);
    status.value = "";
  }
}
</script>

<template>
  <div class="app lb-ui">
    <header>
      <input v-model="pipeline.name" class="name" aria-label="Platform name" />

      <div class="row modes">
        <span class="muted">{{ stored ? "Workspace" : "Pipeline" }}</span>
        <button @click="startOver">Start over</button>
      </div>

      <div class="row">
        <span v-if="status" class="muted">{{ status }}</span>
        <button class="primary" :disabled="steps.length === 0" @click="doExport">
          Export platform
        </button>
      </div>
    </header>

    <p v-if="problem" class="error pad">{{ problem }}</p>

    <div class="columns">
      <ModulePalette
        :modules="modules"
        :stored="stored"
        :can-append="canAppend"
        :why-not="whyNot"
        @add="append"
        @toggle-storage="toggleStorage"
      />

      <section class="board">
        <p v-if="steps.length === 0" class="muted empty">
          <template v-if="stored">
            Add the tools this workspace should have. They do not connect to each other —
            everything reaches the same database.
          </template>
          <template v-else>
            Add a starting step from the left. Steps can only be joined where the data one
            produces is data the next can read.
          </template>
        </p>

        <WorkspaceRing
          v-else-if="stored"
          :steps="steps"
          :selected="selected"
          @select="selected = $event"
          @remove="remove"
        />

        <PipelineFlow
          v-else
          :steps="steps"
          :selected="selected"
          :can-remove="canRemove"
          :why-not-remove="whyNotRemove"
          @select="selected = $event"
          @remove="remove"
        />
      </section>

      <section class="settings">
        <h2>Settings</h2>
        <template v-if="selectedStep?.manifest">
          <label class="field">
            <span>Step name</span>
            <input v-model="selectedStep.node.label" />
          </label>
          <!-- ConfigForm says so itself when there is nothing to show. -->
          <ConfigForm
            :fields="settingsFields"
            :config="selectedStep.node.config ?? {}"
            @update="selectedStep.node.config = $event"
          />
        </template>
        <p v-else class="muted small">Select a step to configure it.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
}

.name {
  width: auto;
  min-width: 14rem;
  font-weight: 600;
}

.modes {
  margin-left: auto;
}

.modes button {
  padding: 0.25rem 0.6rem;
}

.columns {
  display: grid;
  grid-template-columns: 20rem 1fr 20rem;
  flex: 1;
  min-height: 0;
}

.board,
.settings {
  padding: 1rem;
  overflow: auto;
}

.settings {
  background: var(--bg-soft);
  border-left: 1px solid var(--border);
}

h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: 0 0 0.8rem;
}

.board {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.empty {
  max-width: 26rem;
  line-height: 1.5;
  align-self: flex-start;
}

.field {
  display: block;
  margin-bottom: 0.9rem;
}

.field span {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
}

.small {
  font-size: 0.9em;
}
</style>
