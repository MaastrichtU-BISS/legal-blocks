import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every workspace package keeps its tests next to the code it covers.
    include: ["packages/*/test/**/*.test.ts", "layers/*/test/**/*.test.ts"],
  },
});
