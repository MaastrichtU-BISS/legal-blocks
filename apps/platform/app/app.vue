<script setup lang="ts">
// An exported platform. It always has a pipeline — the image is started with
// one mounted next to it — so a missing pipeline is a broken deployment rather
// than a second mode, and says so.
//
// When the pipeline asks people to sign in, nothing else loads until they
// have: every other API route refuses them until then.

import { ref } from "vue";
import Runtime from "@base/runtime/Runtime.vue";
import { getPipeline, getRegistry } from "@base/api";
import type { Pipeline, Registry } from "@base/types";
import { getAuthState, type AuthState } from "./auth";
import SignIn from "./components/SignIn.vue";
import AccountMenu from "./components/AccountMenu.vue";

const auth = ref<AuthState | null>(null);
const registry = ref<Registry | null>(null);
const pipeline = ref<Pipeline | null>(null);
const error = ref("");

async function start() {
  error.value = "";
  pipeline.value = null;
  try {
    auth.value = await getAuthState();
    if (auth.value.login && !auth.value.user) return;

    const [reg, pipe] = await Promise.all([getRegistry(), getPipeline()]);
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
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

void start();
</script>

<template>
  <p v-if="error" class="pad error">{{ error }}</p>
  <SignIn
    v-else-if="auth?.login && !auth.user"
    :setup="auth.needsSetup"
    @signed-in="start"
  />
  <Runtime
    v-else-if="pipeline && registry"
    :pipeline="pipeline"
    :registry="registry"
    :account="auth?.login ? (auth.user ?? undefined) : undefined"
  >
    <template v-if="auth?.login && auth.user" #account>
      <AccountMenu :account="auth.user" @signed-out="start" />
    </template>
  </Runtime>
  <p v-else class="pad muted">Starting…</p>
</template>
