// vue-legal-ml-builder. Its adapter calls the platform's ML operations, which
// sign each request for whoever is signed in; the page never holds a token
// and never learns where the service is.
//
// Workspace only: models belong to people, and a session platform has nobody
// to own them.

import { createSelfHostedAdapter } from "vue-legal-ml-builder";
import type { KindBindings } from "./types";

export const MLAdapter: KindBindings = {
  workspace: {
    async props(ctx) {
      return {
        adapter: createSelfHostedAdapter({ apiUrl: "/api/services/ml" }),
        modelId: ctx.itemId,
      };
    },
    async output() {
      throw new Error("the ML workbench has no output ports");
    },
  },
};
