// Gives the module loader the app to install module plugins on.
//
// Module packages ship a Vue plugin and put real setup in its install():
// vue-legal-docs-visualizer configures PrimeVue with its theme and registers
// the directive its cluster preview positions itself with. A plugin can only be
// applied to an application, and modules load long after that application is
// created, so the loader has to be handed one.
//
// Nuxt has no main.ts to do this in — nuxtApp.vueApp is the app, and a plugin
// is where you get at it. Without this the loader holds null, silently installs
// nothing, and every PrimeVue-based module renders against an unconfigured
// component library: no table styling, and a cluster preview that never opens.

import { setHostApp } from "../modules/loaders";

export default defineNuxtPlugin((nuxtApp) => {
  setHostApp(nuxtApp.vueApp);
});
