// The composer: designs platforms and exports them as zips.
//
// It opens no database, mounts no services and runs no pipeline. Trying a
// platform means exporting it and running it — see the Preview entry in the
// architecture note's decision log for why that is deliberate.
export default defineNuxtConfig({
  extends: ["../../layers/base"],

  devServer: { port: 7788 },
  compatibilityDate: "2026-08-25",
});
