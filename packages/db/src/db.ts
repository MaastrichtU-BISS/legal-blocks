// The platform's shared database.
//
// Modules read and write here instead of handing values to each other. What
// travels along a pipeline edge is a reference — a dataset id, a task id — not
// a payload, so two modules looking at "the same task" are looking at the same
// rows rather than at two copies that can drift.
//
// better-sqlite3 is synchronous, which reads oddly in a Node codebase and is
// the right choice here: these queries are sub-millisecond, the alternative is
// an async wrapper around the same blocking work, and synchronous statements
// let a transaction be an ordinary function instead of a promise chain that
// can be interleaved.

import Database from "better-sqlite3";
import type { Database as Handle } from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Thrown when a requested row does not exist. */
export class NotFoundError extends Error {
  constructor(what = "not found") {
    super(what);
    this.name = "NotFoundError";
  }
}

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");

/**
 * Opens (creating if needed) the database at `path` and applies the schema.
 *
 * The schema is applied with CREATE TABLE statements that assume an empty
 * database, so it runs only when there are no tables yet. There is no
 * migration machinery: at proof-of-concept stage a schema change means
 * deleting the file, and pretending otherwise would be machinery nobody has
 * needed yet.
 */
export function open(path: string): Handle {
  const db = new Database(path);

  // foreign_keys is off by default in SQLite and is per-connection. WAL lets a
  // reader and a writer coexist, which is what stops one annotator saving from
  // blocking another's page load. busy_timeout covers the moment they collide
  // anyway.
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  applySchema(db);
  return db;
}

function applySchema(db: Handle): void {
  const existing = db
    .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .get() as { n: number };
  if (existing.n > 0) return;
  db.exec(readFileSync(schemaPath, "utf8"));
}

/**
 * Runs `fn` in a transaction, rolling back if it throws.
 *
 * Saving one assignment touches four tables; without this a failure halfway
 * through would leave an annotator's document holding some of their spans and
 * none of their relations.
 */
export function transaction<T>(db: Handle, fn: () => T): T {
  return db.transaction(fn)();
}

export type { Handle };
