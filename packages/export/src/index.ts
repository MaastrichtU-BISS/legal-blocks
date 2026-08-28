// Assembles a platform as a zip.
//
// The zip is small on purpose: a compose file, the pipeline, a credentials
// file when the design carries a secret, and a README. Nothing is compiled and
// no program is copied. What the recipient runs is published images, named by
// version in the compose file.
//
// The cost is real and worth stating: the recipient needs Docker, and needs a
// network on first run to pull. Nothing else.

import { randomUUID } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import {
  exportKind,
  order,
  serviceIds,
  splitSecrets,
  type Pipeline,
  type Registry,
} from "@legal-blocks/manifest";

/** Where an exported platform is published on the host. */
export const DEFAULT_PORT = 7777;

export interface ExportOptions {
  pipeline: Pipeline;
  registry: Registry;
  /** The platform image, with its tag. */
  platformImage: string;
  /**
   * The agreement service's image, with its tag. Only named in the compose
   * file when the pipeline actually uses it.
   */
  iaaImage: string;
  /** Port the platform is published on. 0 or absent means the default. */
  port?: number;
  /**
   * Overrides the identifier that keeps this export's storage separate from
   * every other one. Only for tests — leave it unset and a fresh one is made.
   */
  id?: string;
}

/** The zip, as bytes. */
export function buildExport(opts: ExportOptions): Uint8Array {
  const { clean, secrets } = splitSecrets(opts.pipeline, opts.registry);
  const hasCredentials = Object.keys(secrets).length > 0;

  const files: Record<string, Uint8Array> = {
    "docker-compose.yml": strToU8(compose(opts, hasCredentials, opts.id ?? newId())),
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

/**
 * Reduces a pipeline name to something usable as a filename and as a compose
 * project name, which may only hold lowercase letters, digits, dashes and
 * underscores.
 *
 * Anything else is dropped rather than replaced, so a path separator cannot
 * survive into a filename in any form.
 */
function slug(name: string): string {
  let out = "";
  for (const ch of name.trim().toLowerCase()) {
    if (/[a-z0-9]/.test(ch)) out += ch;
    else if (ch === " " || ch === "-" || ch === "_") out += "-";
  }
  out = out.replace(/^-+|-+$/g, "");
  return out === "" ? "platform" : out;
}

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
function compose(opts: ExportOptions, hasCredentials: boolean, id: string): string {
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

/**
 * Tells the recipient where their work lives, which differs completely between
 * the two kinds of export and is the thing they most need to know before they
 * start typing into one.
 */
function storageSection(pipeline: Pipeline): string {
  if (exportKind(pipeline) === "pipeline") {
    return `YOUR WORK

  This platform does not save anything outside your browser. Work stays in the
  browser you did it in: it survives reloading the page and restarting the
  platform, but it is lost if you clear your browsing data, and it is not
  visible in another browser or to anyone else.

  Use the download step to save your results before you finish.
`;
  }
  return `YOUR WORK

  Everything you do is saved as you go, inside the platform's own storage, so
  closing the browser or refreshing the page does not lose anything.

    docker compose down       stops the platform and keeps your work
    docker compose down -v    stops it and deletes your work, permanently

  To take a copy of your work, run this next to this file while the platform is
  running:

    docker compose cp platform:/app/data ./backup
`;
}

/**
 * Warns about the one file in the export that is not safe to pass on. Only
 * included when there is such a file.
 */
function credentialsSection(): string {
  return `THE FILE CALLED "credentials.json"

  This platform searches a document service on your behalf, and that service
  needs an access key. The key is in "credentials.json".

  Treat that file the way you would treat a password:

    - Anyone who has this folder can use the key.
    - Do not put the folder on a shared drive or send it on to other people.
    - If you need to pass the platform to someone else, delete
      "credentials.json" first and ask whoever gave you this for their own copy.

  The key is never shown in your browser. It stays inside the platform and is
  used only in requests to the document service itself.

`;
}

function readme(opts: ExportOptions, hasCredentials: boolean): string {
  const steps = order(opts.pipeline)
    .map((id, i) => {
      const node = opts.pipeline.nodes.find((n) => n.id === id);
      const label = node?.label || opts.registry.modules[node?.module ?? ""]?.name || id;
      return `  ${i + 1}. ${label}`;
    })
    .join("\n");

  const port = opts.port || DEFAULT_PORT;

  return `${opts.pipeline.name}
${"=".repeat(opts.pipeline.name.length)}

WHAT THIS IS

  A platform you run on your own machine with Docker.

  Steps in this platform:

${steps}

WHAT YOU NEED

  Docker Desktop, from https://www.docker.com/products/docker-desktop/
  It is free for personal use and for most academic use. Install it, start it,
  and wait for its whale icon to stop animating.

HOW TO START IT

  1. Open a terminal in this folder.
       macOS   : right-click the folder, Services > New Terminal at Folder
       Windows : right-click in the folder, "Open in Terminal"
       Linux   : right-click in the folder, "Open Terminal Here"

  2. Type this and press Enter:

       docker compose up

  3. Wait. The first time, this downloads the platform — a few hundred
     megabytes, once. Afterwards it starts in a second or two.

  4. Open your browser at:

       http://localhost:${port}

  Leave the terminal open while you work. To stop the platform, press Ctrl+C
  in it, or run  docker compose down  from the same folder.

IF SOMETHING GOES WRONG

  "docker: command not found"
      Docker is not installed, or the terminal was open before you installed
      it. Install it, then close and reopen the terminal.

  "Cannot connect to the Docker daemon"
      Docker is installed but not running. Start Docker Desktop and wait for
      the whale icon to settle, then try again.

  "port is already allocated"
      Something else on your machine is using port ${port} — most likely another
      copy of this platform. Stop it, or change the two numbers on the "ports"
      line in docker-compose.yml to a different port.

  The platform opens but is empty
      Check the terminal for a line mentioning pipeline.json. That file has to
      stay in this folder next to docker-compose.yml.

${storageSection(opts.pipeline)}${hasCredentials ? "\n" + credentialsSection() : ""}`;
}
