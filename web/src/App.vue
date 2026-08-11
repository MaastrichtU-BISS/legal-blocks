<script setup lang="ts">
// One bundle serves both halves of the product. Which one you get is decided
// by the server: a host running an exported platform has a pipeline, a host in
// compose mode does not. No build flag, no second entry point — the exported
// bundle is byte-identical to the composer's.

import { ref } from "vue";
import Composer from "./composer/Composer.vue";
import Runtime from "./runtime/Runtime.vue";
import { getPipeline, getRegistry } from "./api";
import type { Pipeline, Registry } from "./types";

const registry = ref<Registry | null>(null);
const pipeline = ref<Pipeline | null>(null);
const error = ref("");
const ready = ref(false);

Promise.all([getRegistry(), getPipeline()])
  .then(([reg, pipe]) => {
    registry.value = reg;
    pipeline.value = pipe;
  })
  .catch((e: unknown) => {
    error.value = e instanceof Error ? e.message : String(e);
  })
  .finally(() => {
    ready.value = true;
  });
</script>

<template>
  <p v-if="!ready" class="pad muted">Starting…</p>
  <p v-else-if="error" class="pad error">{{ error }}</p>
  <Runtime v-else-if="pipeline && registry" :pipeline="pipeline" :registry="registry" />
  <Composer v-else-if="registry" :registry="registry" />
</template>
