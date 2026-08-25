import { fileURLToPath } from "node:url";

// The shared layer: everything both apps need, and nothing either one owns.
//
// It holds the runtime — the thing that turns a pipeline into a screen — plus
// the workspace shell and the source adapters. The composer extends it because
// its preview of a node uses the same ModuleHost the platform does; the
// platform extends it because that is most of what the platform *is*.
//
// This is also the boundary the composer/platform split now rests on. Go
// enforced it at the linker; here it is structure. `server/api/export.post.ts`
// exists in the composer and nowhere else, and nothing but review stops an
// import crossing over — see §2 of the architecture note.
export default defineNuxtConfig({
  // `@base` rather than relying on auto-imports. The code moved here was
  // written with explicit imports and reads better for it: you can tell where
  // ModuleHost comes from without knowing Nuxt's conventions.
  alias: {
    "@base": fileURLToPath(new URL("./app", import.meta.url)),

    // The module catalogue lives at the repo root, above both apps, so
    // neither app's own rootDir alias can reach it.
    "@registry": fileURLToPath(new URL("../../registry", import.meta.url)),

    // legal-annotation-kit@1.0.0 builds a stylesheet and does not name it in
    // its exports map, so "legal-annotation-kit/style.css" cannot be imported
    // — and neither can the deep path, since an exports map blocks everything
    // it does not list. Resolving to the file directly sidesteps it.
    //
    // The export has been added in the package's source; drop this once a
    // version carrying it is published. Every other module in the registry
    // exports its stylesheet properly, including vue-legal-workspace.
    "legal-annotation-kit/style.css": fileURLToPath(
      new URL(
        "../../node_modules/legal-annotation-kit/dist/legal-annotation-kit.css",
        import.meta.url,
      ),
    ),
  },

  css: ["@base/assets/style.css"],

  // Nothing here is public-facing or indexed, and both apps are single-page
  // tools behind a port on somebody's laptop.
  ssr: false,
});
