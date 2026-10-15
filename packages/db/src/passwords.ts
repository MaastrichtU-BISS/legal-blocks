// Stored passwords. Only ever hashes: the hashing itself happens in the
// platform, with nuxt-auth-utils, so this package never sees a password.

import type { Handle } from "./db.js";

/** The row an address signs in as, with its hash, if it has one. */
export function passwordFor(db: Handle, email: string): { id: number; hash: string } | undefined {
  return db
    .prepare(
      `SELECT id, password_hash AS hash FROM users
        WHERE email = ? AND password_hash IS NOT NULL`,
    )
    .get(email.trim().toLowerCase()) as { id: number; hash: string } | undefined;
}

export function setPassword(db: Handle, userId: number, hash: string): void {
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, userId);
}

/** Whether anybody can sign in yet. A platform where nobody can needs its first admin. */
export function anyoneCanSignIn(db: Handle): boolean {
  return db.prepare(`SELECT 1 FROM users WHERE password_hash IS NOT NULL LIMIT 1`).get() !== undefined;
}
