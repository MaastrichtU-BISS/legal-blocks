// What every route needs: the pipeline this platform runs, the database
// behind it, and the account rows are created under.
//
// All three are resolved once and cached. The pipeline cannot change while the
// server runs — it is mounted read-only beside the platform — and reopening
// SQLite per request would throw away the connection's pragmas along with it.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { H3Event } from "h3";
import { exportKind, parsePipeline, type Pipeline } from "@legal-blocks/manifest";
import { open, usersByEmail, type Handle } from "@legal-blocks/db";
import { registry } from "../../../../layers/base/server-registry";

let pipelineCache: Pipeline | null = null;
let dbCache: Handle | null = null;

/**
 * Where pipeline.json and data/ live. /app in the image, the folder you
 * started the platform from otherwise.
 *
 * Read from the environment at request time, not from runtimeConfig — a
 * runtimeConfig default is baked in at build time and would ignore whatever
 * the compose file sets.
 */
function dir(): string {
  return resolve(process.env["LEGAL_BLOCKS_DIR"] || ".");
}

/**
 * The pipeline this platform runs.
 *
 * Validated on first read rather than trusted: the file is hand-editable and
 * arrives from outside the image, and a pipeline naming a module that does not
 * exist should say so instead of failing later as an empty screen.
 */
export function usePipeline(): Pipeline {
  if (pipelineCache) return pipelineCache;

  const path = join(dir(), "pipeline.json");

  // 503 rather than an unhandled 500, because both of these are somebody's to
  // fix and the message says how. An unhandled error would be swallowed by the
  // error handler as "something went wrong on the platform", which is the
  // least useful thing it could say about a file being in the wrong place.
  if (!existsSync(path)) {
    throw createError({
      statusCode: 503,
      statusMessage:
        `this platform has no pipeline.json. It should sit next to ` +
        `docker-compose.yml in the folder you started the platform from ` +
        `(looked in ${dir()}).`,
    });
  }
  try {
    pipelineCache = parsePipeline(readFileSync(path, "utf8"), registry);
  } catch (e) {
    throw createError({
      statusCode: 503,
      statusMessage: `${path} is not a valid pipeline: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  return pipelineCache;
}

/**
 * The database, or null when this platform stores nothing.
 *
 * A pipeline opens no database and creates no data directory — there is
 * nothing to put in one. That is not an optimisation: it is what makes an
 * exported case-law explorer the same shape as a hand-written demo.
 */
export function useDb(): Handle | null {
  if (dbCache) return dbCache;
  if (exportKind(usePipeline()) !== "workspace") return null;

  const data = join(dir(), "data");
  mkdirSync(data, { recursive: true });
  dbCache = open(join(data, "platform.db"));
  return dbCache;
}

/**
 * The database, or a 501 explaining why there isn't one.
 *
 * Reaching a stored-data route in a platform built not to store any is a
 * wiring mistake worth saying out loud rather than a 500.
 */
export function requireDb(event: H3Event): Handle {
  const db = useDb();
  if (!db) {
    throw fail(event, 501, `this platform stores nothing, so ${event.path} does not exist here`);
  }
  return db;
}

/**
 * The address the platform's own account is created under until there is a
 * login. Deliberately in a domain that can never receive mail: nothing should
 * send to it, and if a real person's address ended up here they would silently
 * own everything.
 */
const OWNER_EMAIL = "owner@platform.invalid";

/**
 * The user rows are created under.
 *
 * Everything is owned by one account for now. This is the one place that
 * assumption lives, so a login replaces it here rather than in every query.
 */
export function owner(db: Handle): number {
  const [user] = usersByEmail(db, [OWNER_EMAIL]);
  if (!user) throw new Error("could not resolve the platform's owner account");
  return user.id;
}
