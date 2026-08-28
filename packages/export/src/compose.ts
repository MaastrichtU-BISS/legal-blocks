// The file the recipient runs.

import { randomUUID } from "node:crypto";
import { serviceIds } from "@legal-blocks/manifest";
import { DEFAULT_PORT, slug, type ExportOptions } from "./options.js";

/**
 * What tells two exports apart.
 *
 * Compose derives a volume's real name from the project name, and the project
 * name used to be the platform's own — so two exports of a tool called the
 * same thing got the same volume and, silently, the same database. That was
 * not a problem while data lived in ./data next to the compose file, because
 * two folders could not be the same folder. A named volume has no folder, so
 * the export has to carry the distinction itself.
 *
 * Made once, at export time, and written into the file: `docker compose down`
 * and `up` in the same folder must come back to the same work, and only a new
 * export should start empty.
 */
function newId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

/**
 * The file the recipient runs.
 *
 * Four choices in here are deliberate and easy to get wrong later.
 *
 * The published port is bound to 127.0.0.1, not to every interface. The
 * platform has no login: anything that can reach the port can read and write
 * everyone's work. Inside the container it listens on every interface because
 * that is the only way the mapping can reach it, so this line is the entire
 * access boundary.
 *
 * Data is a named volume, and the project name carries a unique id so that two
 * exports of a platform with the same name cannot end up sharing it. Both
 * halves were learned the hard way — see the named-volume note below and
 * newId above.
 *
 * credentials.json is mounted only when there is one. Compose creates a
 * *directory* where a bind mount source is missing, so an unconditional line
 * would leave every credential-free platform with a puzzling empty folder.
 *
 * The agreement service is a second container, and only appears when the
 * pipeline uses it. It stays in Go because it is agreement statistics that
 * already exist and work; the platform reaches it over the compose network, so
 * it is never published on the host at all.
 */
export function compose(opts: ExportOptions, hasCredentials: boolean): string {
  const id = opts.id ?? newId();
  const port = opts.port || DEFAULT_PORT;
  const needsIaa = serviceIds(opts.pipeline, opts.registry).includes("lawnotation-iaa");

  const lines = [
    `# ${opts.pipeline.name}`,
    "#",
    "# Start:  docker compose up",
    "# Stop:   docker compose down     (your work is kept)",
    "#         docker compose down -v  (your work is deleted)",
    "#",
    "# The image tags are the version of Legal Blocks this platform was built",
    "# with. Changing them upgrades the platform; your data is not touched.",
    "",
    // The id is what keeps this export's containers and its database apart
    // from another export of a platform with the same name. See newId.
    `name: ${slug(opts.pipeline.name)}-${id}`,
    "",
    "services:",
    "  platform:",
    `    image: ${opts.platformImage}`,
    "    restart: unless-stopped",
    "    ports:",
    `      - "127.0.0.1:${port}:${DEFAULT_PORT}"`,
    "    volumes:",
    "      - ./pipeline.json:/app/pipeline.json:ro",
  ];
  if (hasCredentials) lines.push("      - ./credentials.json:/app/credentials.json:ro");
  // A named volume rather than ./data. Docker gives a fresh one the ownership
  // of /app/data in the image, so the platform's uid can write to it on Linux
  // as well as macOS. A bind mount is created root-owned by the daemon on
  // Linux, and every storage route then fails with SQLITE_CANTOPEN — which is
  // what shipped, because Docker Desktop virtualises that away on a Mac.
  lines.push("      - data:/app/data");

  if (needsIaa) {
    lines.push(
      "    environment:",
      "      LEGAL_BLOCKS_IAA_URL: http://agreement:8080",
      "    depends_on:",
      "      - agreement",
      "",
      "  # Computes inter-annotator agreement. Reached by the platform over the",
      "  # compose network and deliberately not published on your machine.",
      "  agreement:",
      `    image: ${opts.iaaImage}`,
      "    restart: unless-stopped",
    );
  }

  // Last, because both blocks above append to the same list and a top-level
  // key cannot sit inside a service.
  lines.push("", "volumes:", "  data:");

  return lines.join("\n") + "\n";
}
