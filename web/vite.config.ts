import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// One bundle serves both the composer and every exported platform. Module
// components are dynamically imported (see src/modules/loaders.ts), so Vite
// splits each one into its own chunk and a platform only downloads the modules
// its pipeline actually uses.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // legal-annotation-kit@1.0.0 builds a stylesheet but does not list it in
      // its exports map, so "legal-annotation-kit/style.css" cannot be
      // imported — and neither can the deep path, since an exports map blocks
      // everything it does not name. Resolving to the file directly sidesteps
      // it. The export has been added in the package's source; drop this alias
      // once a version carrying it is published.
      "legal-annotation-kit/style.css": fileURLToPath(
        new URL(
          "./node_modules/legal-annotation-kit/dist/legal-annotation-kit.css",
          import.meta.url,
        ),
      ),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // `npm run dev` talks to a Go host started separately with
    // `go run ./cmd/legal-blocks compose -no-open`.
    proxy: {
      "/api": "http://localhost:7788",
    },
  },
});
