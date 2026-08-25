// An exported platform.
//
// Started with a pipeline.json mounted beside it and a data folder to write
// to; it reads the pipeline once at boot and renders whatever that pipeline
// says. It cannot design or export a platform — that is the composer.
export default defineNuxtConfig({
  extends: ["../../layers/base"],

  // Deliberately no runtimeConfig for the two settings a compose file sets.
  //
  // A runtimeConfig default is evaluated when the image is *built*, so
  // `process.env.X ?? "..."` there reads the build environment and bakes the
  // result in — the compose file's `environment:` block then changes nothing.
  // That shipped an export whose agreement metrics were silently unreachable,
  // and it looked like a networking problem rather than a config one.
  //
  // Both are read at request time instead. See server/utils/platform.ts.

  nitro: {
    // Reshapes every failure into {"error": "..."} — see server/error.ts.
    errorHandler: "~~/server/error",
  },

  devServer: { port: 7777 },
  compatibilityDate: "2026-08-25",
});
