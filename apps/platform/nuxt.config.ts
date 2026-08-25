// An exported platform.
//
// Started with a pipeline.json mounted beside it and a data folder to write
// to; it reads the pipeline once at boot and renders whatever that pipeline
// says. It cannot design or export a platform — that is the composer.
export default defineNuxtConfig({
  extends: ["../../layers/base"],

  runtimeConfig: {
    // Where pipeline.json and data/ live. /app in the image, the folder you
    // started it from otherwise.
    dir: process.env.LEGAL_BLOCKS_DIR ?? ".",
  },

  devServer: { port: 7777 },
  compatibilityDate: "2026-08-25",
});
