<script setup lang="ts">
// The composer, which needs the module catalogue and nothing else. It has no
// pipeline: the draft lives in the browser until it is exported.

import { ref } from "vue";
import Composer from "./components/Composer.vue";
import { getRegistry } from "@base/api";
import type { Registry } from "@base/types";

const registry = ref<Registry | null>(null);
const error = ref("");

getRegistry()
  .then((reg) => {
    registry.value = reg;
  })
  .catch((e: unknown) => {
    error.value = e instanceof Error ? e.message : String(e);
  });
</script>

<template>
  <p v-if="error" class="pad error">{{ error }}</p>
  <Composer v-else-if="registry" :registry="registry" />
  <p v-else class="pad muted">Starting…</p>
</template>
