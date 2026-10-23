<script setup lang="ts">
// The composer, which needs the module catalogue and nothing else. It has no
// pipeline: the draft lives in the browser until it is exported.

import { ref } from "vue";
import Composer from "./components/Composer.vue";
import Landing from "./components/Landing.vue";
import Docs from "./components/Docs.vue";
import Projects from "./components/Projects.vue";
import { getRegistry } from "@base/api";
import type { Registry } from "@legal-blocks/manifest";

const registry = ref<Registry | null>(null);
const error = ref("");
type View = "landing" | "docs" | "projects" | "compose";
const view = ref<View>("landing");
const currentProjectName = ref("");

getRegistry()
  .then((reg) => {
    registry.value = reg;
  })
  .catch((e: unknown) => {
    error.value = e instanceof Error ? e.message : String(e);
  });

const pathFor: Record<View, string> = {
  landing: "/",
  projects: "/projects",
  docs: "/docs",
  compose: "/compose",
};

const viewFor: Record<string, View> = {
  "/": "landing",
  "/projects": "projects",
  "/docs": "docs",
  "/compose": "compose",
};

function go(v: View) {
  view.value = v;
  if (typeof window !== "undefined" && window.location.pathname !== pathFor[v]) {
    window.history.pushState({ view: v }, "", pathFor[v]);
  }
}

function syncFromLocation() {
  const v = viewFor[window.location.pathname];
  if (v) view.value = v;
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", syncFromLocation);
  syncFromLocation();
}
</script>

<template>
  <p v-if="error" class="pad error">{{ error }}</p>
  <Landing
    v-else-if="view === 'landing'"
    @start="go('projects')"
    @docs="go('docs')"
  />
  <Projects
    v-else-if="view === 'projects'"
    @back="go('landing')"
    @docs="go('docs')"
    @compose="go('compose')"
    @open="(name: string) => { currentProjectName = name; go('compose'); }"
  />
  <Docs
    v-else-if="view === 'docs'"
    @back="go('landing')"
    @compose="go('projects')"
  />
  <Composer
    v-else-if="view === 'compose' && registry"
    :registry="registry"
    :initial-name="currentProjectName"
    @back="go('projects')"
    @docs="go('docs')"
  />
  <p v-else class="pad muted">Starting…</p>
</template>