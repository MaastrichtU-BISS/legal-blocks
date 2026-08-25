// Maps a manifest's entry.package to a dynamic import.
//
// The imports are written out rather than computed so Vite can see them and
// split each module into its own chunk: a platform whose pipeline has no
// search step never downloads the query builder. This map is the one place a
// new web module has to be mentioned in frontend code — everything else about
// it comes from its manifest.

import type { App, Component, Plugin } from "vue";
import type { Entry } from "../types";

type Loader = () => Promise<Record<string, unknown>>;

const packages: Record<string, Loader> = {
  "@legal-blocks/builtin": () => import("./builtin"),
  "legal-annotation-kit": () => import("legal-annotation-kit"),
  "vue-iaa-metrics": () => import("vue-iaa-metrics"),
  "vue-legal-query-builder": () => import("vue-legal-query-builder"),
  "vue-legal-docs-visualizer": () => import("vue-legal-docs-visualizer"),
  "vue-legal-docs-import": () => import("vue-legal-docs-import"),
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
  "vue-legal-docs-import/style.css": () => import("vue-legal-docs-import/style.css"),
};

const loaded = new Set<string>();
const installed = new Set<string>();

/**
 * The app these modules mount into, so their plugins can be installed on it.
 *
 * A Vue plugin can only be applied to an application, and modules are loaded
 * long after this one is created — so the app has to be reachable from here.
 */
let host: App | null = null;

/** Called once at startup. */
export function setHostApp(app: App): void {
  host = app;
}

/**
 * Resolves a manifest entry to a mountable component, installing the package's
 * plugin if it ships one.
 *
 * That last part is not optional politeness. These packages put real setup in
 * their plugin's install(): vue-legal-docs-visualizer configures PrimeVue with
 * its theme and registers the tooltip directive there. Import the component on
 * its own and it renders with an unstyled component library underneath and a
 * missing directive — which looks like broken CSS and is actually a plugin
 * that was never applied.
 */
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

  // Installing twice would re-run setup and warn, so each package gets one go.
  if (host && !installed.has(entry.package)) {
    installed.add(entry.package);
    const plugin = mod.default as Plugin | undefined;
    if (plugin && typeof (plugin as { install?: unknown }).install === "function") {
      host.use(plugin);
    }
  }

  const component = mod[entry.component];
  if (!component) {
    throw new Error(`"${entry.package}" has no export named "${entry.component}"`);
  }
  return component as Component;
}
