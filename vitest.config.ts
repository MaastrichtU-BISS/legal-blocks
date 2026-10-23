import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@registry": fileURLToPath(new URL("./registry", import.meta.url)),
    },
  },
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "layers/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
    ],
  },
});
