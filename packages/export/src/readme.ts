// The only part of an export written for somebody who has never used a
// terminal. Everything else in the zip is for a machine.

import { exportKind, order, type Pipeline } from "@legal-blocks/manifest";
import { DEFAULT_PORT, type ExportOptions } from "./options.js";

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

export function readme(opts: ExportOptions, hasCredentials: boolean): string {
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
