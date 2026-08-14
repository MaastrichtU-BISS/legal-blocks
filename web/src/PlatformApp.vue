<script setup lang="ts">
// An exported platform. It always has a pipeline — the image is started with
// one mounted next to it — so a missing pipeline is a broken deployment rather
// than a second mode, and says so.

import { ref } from "vue";
import Runtime from "./runtime/Runtime.vue";
import { getPipeline, getRegistry } from "./api";
import type { Pipeline, Registry } from "./types";

const registry = ref<Registry | null>(null);
const pipeline = ref<Pipeline | null>(null);
const error = ref("");

Promise.all([getRegistry(), getPipeline()])
  .then(([reg, pipe]) => {
    if (!pipe) {
      // The compose file mounts pipeline.json read-only next to the platform.
      // Reaching here means it is missing, and the person seeing this screen
      // is the one who can put it back.
      error.value =
        "This platform has no pipeline.json. It should sit next to " +
        "docker-compose.yml in the folder you started the platform from.";
      return;
    }
    registry.value = reg;
    pipeline.value = pipe;
  })
  .catch((e: unknown) => {
    error.value = e instanceof Error ? e.message : String(e);
  });
</script>

<template>
  <p v-if="error" class="pad error">{{ error }}</p>
  <Runtime v-else-if="pipeline && registry" :pipeline="pipeline" :registry="registry" />
  <p v-else class="pad muted">Starting…</p>
</template>
