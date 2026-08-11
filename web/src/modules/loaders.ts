// Maps a manifest's entry.package to a dynamic import.
//
// The imports are written out rather than computed so Vite can see them and
// split each module into its own chunk: a platform whose pipeline has no
// search step never downloads the query builder. This map is the one place a
// new web module has to be mentioned in frontend code — everything else about
// it comes from its manifest.

import type { Component } from "vue";
import type { Entry } from "../types";

type Loader = () => Promise<Record<string, unknown>>;

const packages: Record<string, Loader> = {
  "@legal-blocks/builtin": () => import("./builtin"),
  "legal-annotation-kit": () => import("legal-annotation-kit"),
  "vue-iaa-metrics": () => import("vue-iaa-metrics"),
  "vue-legal-query-builder": () => import("vue-legal-query-builder"),
  "vue-legal-docs-visualizer": () => import("vue-legal-docs-visualizer"),
};

// Styles are separate entry points in these packages, and importing a
// stylesheet for a module that is not on screen would leak its styling into
// the rest of the platform, so they load alongside their component and only
// then.
const styles: Record<string, () => Promise<unknown>> = {
  "legal-annotation-kit/style.css": () => import("legal-annotation-kit/style.css"),
  "vue-iaa-metrics/style.css": () => import("vue-iaa-metrics/style.css"),
  "vue-legal-query-builder/style.css": () => import("vue-legal-query-builder/style.css"),
  "vue-legal-docs-visualizer/style.css": () => import("vue-legal-docs-visualizer/style.css"),
};

const loaded = new Set<string>();

/** Resolves a manifest entry to a mountable component. */
export async function loadComponent(entry: Entry): Promise<Component> {
  const load = packages[entry.package];
  if (!load) {
    throw new Error(
      `module package "${entry.package}" is not in this build — add it to web/src/modules/loaders.ts`,
    );
  }

  if (entry.style && !loaded.has(entry.style)) {
    const loadStyle = styles[entry.style];
    if (loadStyle) {
      await loadStyle();
      loaded.add(entry.style);
    }
  }

  const mod = await load();
  const component = mod[entry.component];
  if (!component) {
    throw new Error(`"${entry.package}" has no export named "${entry.component}"`);
  }
  return component as Component;
}
