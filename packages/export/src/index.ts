// Assembles a platform as a zip.
//
// The zip is small on purpose: a compose file, the pipeline, a credentials file
// when the design carries a secret, and a README. Nothing is compiled and no
// program is copied. What the recipient runs is published images, named by
// version in the compose file.
//
// The cost is real and worth stating: the recipient needs Docker, and needs a
// network on first run to pull. Nothing else.

import { zipSync, strToU8 } from "fflate";
import { splitSecrets } from "@legal-blocks/manifest";
import { compose } from "./compose.js";
import { readme } from "./readme.js";
import { slug, type ExportOptions } from "./options.js";

export { DEFAULT_PORT, type ExportOptions } from "./options.js";

/** The zip, as bytes. */
export function buildExport(opts: ExportOptions): Uint8Array {
  const { clean, secrets } = splitSecrets(opts.pipeline, opts.registry);
  const hasCredentials = Object.keys(secrets).length > 0;

  const files: Record<string, Uint8Array> = {
    "docker-compose.yml": strToU8(compose(opts, hasCredentials)),
    "pipeline.json": strToU8(JSON.stringify(clean, null, 2) + "\n"),
    "README.txt": strToU8(readme(opts, hasCredentials)),
  };
  if (hasCredentials) {
    files["credentials.json"] = strToU8(JSON.stringify(secrets, null, 2) + "\n");
  }

  return zipSync(files, { level: 9 });
}

/** Turns a pipeline name into a safe zip filename. */
export function exportFilename(name: string): string {
  return slug(name) + ".zip";
}
