import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Two apps, two builds, one source tree.
//
// The composer and an exported platform used to be one bundle that decided at
// runtime which half to show. That meant every exported platform downloaded
// the composer UI and shipped it inside its image. Building them separately is
// what makes "the platform contains no composer" true rather than merely
// unreachable.
//
// Each app is a folder under apps/ holding only an index.html. Vite's `root`
// points at one of them, so the build emits an index.html the Go static
// handler can serve without renaming anything.
//
//   APP=composer npm run build   ->  dist/composer/index.html
//   APP=platform npm run build   ->  dist/platform/index.html
//
// Module components are dynamically imported (see src/modules/loaders.ts), so
// Vite splits each into its own chunk and a platform only downloads the
// modules its pipeline actually uses.
const app = process.env.APP === "composer" ? "composer" : "platform";

export default defineConfig({
  root: `apps/${app}`,
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
    // Relative to root, which is apps/<app>.
    outDir: `../../dist/${app}`,
    emptyOutDir: true,
  },
  server: {
    // `npm run dev` talks to a Go host started separately:
    //   go run ./cmd/composer   (port 7788)  for APP=composer
    //   go run ./cmd/platform   (port 7777)  for APP=platform
    proxy: {
      "/api": app === "composer" ? "http://localhost:7788" : "http://localhost:7777",
    },
  },
});
