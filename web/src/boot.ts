// What both apps do before mounting.
//
// The composer and an exported platform are separate builds with separate
// entry points, and share only this: create the app, hand it to the module
// loader, mount it. Keeping it in one place means the two entries differ by
// exactly one line — the component they mount — which is the honest size of
// the difference.

import { createApp } from "vue";
import type { Component } from "vue";
import { setHostApp } from "./modules/loaders";
import "./style.css";

export function boot(root: Component): void {
  const app = createApp(root);

  // Modules are loaded on demand, long after this point, and some of them ship
  // a Vue plugin that has to be applied to an application. This is how they
  // reach one.
  setHostApp(app);

  app.mount("#app");
}
