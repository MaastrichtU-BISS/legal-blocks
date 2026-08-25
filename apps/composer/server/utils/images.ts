/**
 * Which images an export should name.
 *
 * The composer writes its own version. Both images are built from one commit,
 * so "the platform image with my version number" is the one that agrees with
 * this composer about the module registry and the frontend contract.
 *
 * That is the whole drift guarantee. The Go implementation got it from the
 * export being a *copy* of the composer binary; here it is a version number
 * written into the compose file — weaker looking, stronger in practice,
 * because it is explicit, inspectable, and upgradable by editing one line.
 *
 * A dev build points at :dev deliberately rather than :latest. An export made
 * from an unreleased composer should fail to pull loudly on someone else's
 * machine, not quietly run whatever :latest happens to be that week.
 */
export function images() {
  const cfg = useRuntimeConfig();
  return {
    platformImage: `${cfg.platformImage}:${cfg.version}`,
    iaaImage: `${cfg.iaaImage}:${cfg.iaaVersion}`,
  };
}
