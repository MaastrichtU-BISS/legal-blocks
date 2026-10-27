<script setup lang="ts">
// The composer: pick modules, arrange them, export.
//
// This file is the shell. What may go into a platform lives in
// usePlatformDraft; how it looks lives in the components beside it. Keeping the
// rules out of the screens is what makes them followable by reading: "can this
// module be added" is a question about a platform, not about a column.

import { computed, onBeforeUnmount, onMounted, ref, toRef } from "vue";
import ConfigForm from "./ConfigForm.vue";
import ModulePalette from "./ModulePalette.vue";
import PipelineFlow from "./PipelineFlow.vue";
import WorkspaceRing from "./WorkspaceRing.vue";
import { usePlatformDraft } from "../composables/usePlatformDraft";
import ThemeToggle from "@base/components/ThemeToggle.vue";
import { exportPipeline } from "@base/api";
import type { Registry } from "@legal-blocks/manifest";
import { appliesIn as fieldAppliesIn } from "@legal-blocks/manifest";
import { fieldShown } from "@legal-blocks/manifest";

const props = defineProps<{ registry: Registry; initialName?: string }>();

const emit = defineEmits<{ back: []; docs: [] }>();

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
  reorder,
  toggleStorage,
  startOver,
} = usePlatformDraft(toRef(props, "registry"));

if (props.initialName) pipeline.value.name = props.initialName;

const status = ref("");

// Keyboard shortcuts for the composer shell.
function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
  if (e.key === "Escape") {
    selected.value = null;
    e.preventDefault();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
    if (steps.value.length > 0) {
      doExport();
      e.preventDefault();
    }
    return;
  }
  if (kind.value === "pipeline" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    const idx = steps.value.findIndex((s) => s.node.id === selected.value);
    const next = e.key === "ArrowRight" ? idx + 1 : idx - 1;
    if (next >= 0 && next < steps.value.length) {
      selected.value = steps.value[next]!.node.id;
      e.preventDefault();
    }
  }
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

const modules = computed(() =>
  Object.values(props.registry.modules).sort((a, b) => a.name.localeCompare(b.name)),
);

const selectedStep = computed(() => steps.value.find((s) => s.node.id === selected.value));

/**
 * Settings the composer owns in this mode; the rest belong to runtime users.
 * Of those, only the ones the step's other choices have not ruled out — the
 * template picker only in guided mode, say.
 */
const settingsFields = computed(() => {
  const all = (selectedStep.value?.manifest?.config ?? []).filter((f) =>
    fieldAppliesIn(f, kind.value),
  );
  const config = selectedStep.value?.node.config ?? {};
  return all.filter((f) => fieldShown(f, all, config));
});

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
      <nav class="top-nav">
        <button class="nav-link" @click="emit('back')">Projects</button>
        <button class="nav-link" @click="emit('docs')">Docs</button>
      </nav>
      <span class="platform-name">{{ pipeline.name || "Untitled platform" }}</span>

      <div class="row modes">
        <span class="muted">{{ stored ? "With database" : "Without database" }}</span>
        <button :class="{ primary: !stored }" @click="toggleStorage">
          {{ stored ? "Remove database" : "Add database" }}
        </button>
        <button @click="startOver">Start over</button>
      </div>

      <div class="row">
        <span v-if="status" class="muted">{{ status }}</span>
        <button class="primary" :disabled="steps.length === 0" @click="doExport">
          Export platform
        </button>
        <ThemeToggle />
      </div>
    </header>

    <p v-if="problem" class="error pad">{{ problem }}</p>

    <div class="columns">
      <ModulePalette
        :modules="modules"
        :stored="stored"
        :login="!!pipeline.login"
        :can-append="canAppend"
        :why-not="whyNot"
        @add="append"
        @toggle-storage="toggleStorage"
        @toggle-login="pipeline.login = !pipeline.login"
      />

      <section class="board">
        <div v-if="steps.length === 0 && !pipeline.login" class="empty-state">
          <h3>{{ stored ? "Empty application" : "No steps yet" }}</h3>
          <p>
            <template v-if="stored">
              Add the tools this application should have from the left. They do not connect
              to each other — everything reaches the same database.
            </template>
            <template v-else>
              Add a starting step from the left. Steps can only be joined where the data
              one produces is data the next can read.
            </template>
          </p>
          <p class="muted small">
            Tip: press <kbd>A</kbd> to add the first module, <kbd>?</kbd> for shortcuts.
          </p>
        </div>

        <WorkspaceRing
          v-else-if="stored"
          :steps="steps"
          :selected="selected"
          :login="!!pipeline.login"
          @select="selected = $event"
          @remove="remove"
          @remove-login="pipeline.login = false"
        />

        <PipelineFlow
          v-else
          :steps="steps"
          :selected="selected"
          :can-remove="canRemove"
          :why-not-remove="whyNotRemove"
          :login="!!pipeline.login"
          @select="selected = $event"
          @remove="remove"
          @reorder="(from, to) => reorder(from, to)"
          @remove-login="pipeline.login = false"
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
            :model-value="selectedStep.node.config ?? {}"
            @update:model-value="selectedStep.node.config = $event"
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
  font-family: var(--font-body);
  background: var(--ground);
  color: var(--ink);
}

header {
  display: flex;
  align-items: center;
  gap: var(--space-md, 1rem);
  padding: var(--space-sm, 0.6rem) var(--space-md, 1rem);
  border-bottom: 1px solid var(--rule);
  background: var(--surface);
  flex-wrap: wrap;
}

.top-nav {
  display: flex;
  align-items: center;
  gap: var(--space-xs, 4px);
}

.top-nav .nav-link {
  background: transparent;
  border: 0;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm, 8px);
}

.top-nav .nav-link:hover {
  background: var(--ground);
  color: var(--accent-interactive);
}

header strong {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 18px;
  color: var(--ink);
}

.platform-name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 16px;
  color: var(--ink);
}

.modes {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.modes button {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--radius-sm, 2px);
}

.columns {
  display: grid;
  grid-template-columns: 20rem 1fr 20rem;
  flex: 1;
  min-height: 0;
}

@media (max-width: 1024px) {
  .columns {
    grid-template-columns: 1fr;
  }
  .settings {
    border-left: 0;
    border-top: 1px solid var(--rule);
  }
}

.board,
.settings {
  padding: var(--space-md, 1rem);
  overflow: auto;
}

.settings {
  background: var(--surface);
  border-left: 2px solid var(--ink);
}

h2 {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: 0 0 var(--space-md, 0.8rem);
  font-weight: 500;
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
  color: var(--muted);
}

.field {
  display: block;
  margin-bottom: var(--space-md, 0.9rem);
}

.field span {
  display: block;
  margin-bottom: var(--space-xs, 0.25rem);
  font-weight: 500;
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.small {
  font-size: 0.9em;
}
</style>
