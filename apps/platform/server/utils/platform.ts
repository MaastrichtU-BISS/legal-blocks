// What every route needs: the pipeline this platform runs, the database
// behind it, and the account rows are created under.
//
// All three are resolved once and cached. The pipeline cannot change while the
// server runs — it is mounted read-only beside the platform — and reopening
// SQLite per request would throw away the connection's pragmas along with it.

import { accessSync, constants, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { H3Event } from "h3";
import { exportKind, parsePipeline, requiresLogin, type Pipeline } from "@legal-blocks/manifest";
import { open, setRole, usersByEmail, type Handle } from "@legal-blocks/db";
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
  return exportKind(usePipeline()) === "workspace" ? openDb() : null;
}

/**
 * The database the platform's accounts live in. The same file as the
 * workspace's, so a pipeline that asks people to sign in gets one too and
 * simply leaves its other tables empty. Without a login only a workspace has
 * accounts, and a pipeline answers 501 as for any other stored data.
 */
export function useAccountsDb(event: H3Event): Handle {
  return requiresLogin(usePipeline()) ? openDb() : requireDb(event);
}

/** The data folder, created on first use. Where the database and session secret live. */
export function dataDir(): string {
  const data = join(dir(), "data");
  try {
    mkdirSync(data, { recursive: true });
    accessSync(data, constants.W_OK);
  } catch (e) {
    throw createError({
      statusCode: 503,
      statusMessage:
        `this platform's data directory (${data}) is not writable. ` +
        `Check its ownership and permissions ` +
        `(the cause is usually a read-only mount, SELinux, or NFS).`,
    });
  }
  return data;
}

function openDb(): Handle {
  if (dbCache) return dbCache;
  const data = dataDir();
  try {
    dbCache = open(join(data, "platform.db"));
  } catch (e) {
    throw createError({
      statusCode: 503,
      statusMessage:
        `this platform's data directory (${data}) is not writable. ` +
        `Check its ownership and permissions ` +
        `(the cause is usually a read-only mount, SELinux, or NFS).`,
    });
  }

  // Settle the platform's own account now rather than on the first write.
  // Whether somebody is an admin decides what the workspace offers them, and
  // that question is asked by a read — so an account that only becomes an
  // admin once something has been saved is an account that looks like an
  // annotator to the first person who opens the platform.
  //
  // A platform with a login has no such account: its first admin is whoever
  // sets it up, and everything is owned by whoever is signed in.
  if (!requiresLogin(usePipeline())) owner(dbCache);
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
 * The address the platform's own account is created under when there is no
 * login. Deliberately in a domain that can never receive mail: nothing should
 * send to it, and if a real person's address ended up here they would silently
 * own everything.
 */
const OWNER_EMAIL = "owner@platform.invalid";

/**
 * The user rows are created under when nobody signs in.
 *
 * Everything is owned by one account then. With a login, currentUser in
 * current-user.ts answers instead.
 */
export function owner(db: Handle): number {
  const [user] = usersByEmail(db, [OWNER_EMAIL]);
  if (!user) throw new Error("could not resolve the platform's owner account");

  // usersByEmail creates everyone as an annotator, because that is what an
  // address typed into a task's annotator list is. This account is not one, and
  // the difference has to be recorded rather than inferred from the address:
  // the workspace decides what to show from the role, and a role the database
  // does not hold is a rule living in a string comparison somewhere.
  if (user.role !== "admin") {
    setRole(db, user.id, "admin");
    return user.id;
  }
  return user.id;
}
