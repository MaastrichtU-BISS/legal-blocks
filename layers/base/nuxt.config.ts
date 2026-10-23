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
  },

  css: ["@base/assets/style.css"],

  app: {
    head: {
      script: [
        {
          innerHTML:
            "(function(){try{var p=localStorage.getItem('legal-blocks:theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-theme','dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.setAttribute('data-theme','light');document.documentElement.style.colorScheme='light';}}catch(e){}})();",
          tagPosition: "head",
        },
      ],
    },
  },

  // Nothing here is public-facing or indexed, and both apps are single-page
  // tools behind a port on somebody's laptop.
  ssr: false,
});
