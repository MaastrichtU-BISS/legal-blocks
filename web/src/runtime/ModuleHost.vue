<script setup lang="ts">
// Mounts one pipeline step: resolves the module's component from its manifest,
// asks its host binding for props, and renders it. Everything module-specific
// lives in the manifest and the binding — this component never names a module.

import { ref, watch } from "vue";
import type { Component } from "vue";
import { loadComponent } from "../modules/loaders";
import type { Manifest, Node } from "../types";
import { bindingFor } from "./bindings";
import { contextFor, type ResolveEnv } from "./resolve";

// Mounting a step can create rows the shell shows — preparing a task creates
// the users the "Working as" selector lists — so the shell is told when a
// mount finishes rather than having to guess when to re-read.
const emit = defineEmits<{ mounted: [] }>();

const props = defineProps<{
  env: ResolveEnv;
  node: Node;
  manifest: Manifest;
  /** Bumped by the parent to force a reload after upstream data changes. */
  revision: number;
}>();

const component = ref<Component | null>(null);
const componentProps = ref<Record<string, unknown>>({});
const error = ref("");
const loading = ref(true);

async function mount() {
  loading.value = true;
  error.value = "";
  component.value = null;
  try {
    if (!props.manifest.entry) {
      throw new Error(`module "${props.manifest.id}" has no entry to render`);
    }
    const [comp, bound] = await Promise.all([
      loadComponent(props.manifest.entry),
      bindingFor(props.manifest.host, props.env.kind).props(contextFor(props.env, props.node.id)),
    ]);
    component.value = comp;
    componentProps.value = bound;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
    emit("mounted");
  }
}

// Remount when the step changes, when the annotator changes (their queue and
// therefore their source is different), or when the parent bumps revision.
watch(
  () => [props.node.id, props.env.kind, props.env.annotator, props.revision],
  () => mount(),
  { immediate: true },
);
</script>

<template>
  <div class="host">
    <p v-if="loading" class="pad muted">Loading {{ manifest.name }}…</p>
    <div v-else-if="error" class="pad">
      <p class="error"><strong>This step could not be opened.</strong></p>
      <p class="error">{{ error }}</p>
    </div>
    <component :is="component" v-else-if="component" v-bind="componentProps" />
  </div>
</template>

<style scoped>
.host {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
