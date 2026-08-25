// The composer: designs platforms and exports them as zips.
//
// It opens no database, mounts no services and runs no pipeline. Trying a
// platform means exporting it and running it — see the Preview entry in the
// architecture note's decision log for why that is deliberate.
export default defineNuxtConfig({
  extends: ["../../layers/base"],

  runtimeConfig: {
    // Stamped at build time. See server/utils/images.ts for why the composer
    // writes its own version rather than :latest.
    version: process.env.LEGAL_BLOCKS_VERSION ?? "dev",
    platformImage:
      process.env.LEGAL_BLOCKS_PLATFORM_IMAGE ?? "ghcr.io/maastrichtu-biss/legal-blocks-platform",
    iaaImage: process.env.LEGAL_BLOCKS_IAA_IMAGE ?? "ghcr.io/maastrichtu-biss/lawnotation-iaa",
    iaaVersion: process.env.LEGAL_BLOCKS_IAA_VERSION ?? "dev",
  },

  nitro: {
    errorHandler: "~~/server/error",
  },

  devServer: { port: 7788 },
  compatibilityDate: "2026-08-25",
});
