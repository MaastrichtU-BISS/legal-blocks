// The secret nuxt-auth-utils encrypts the session cookie with.
//
// Generated on the first sign-in and kept in the data volume, so an export
// carries no secret of its own and a restart does not sign everybody out.
// NUXT_SESSION_PASSWORD still wins when a deployment sets one.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function ensureSessionSecret(): void {
  if (process.env["NUXT_SESSION_PASSWORD"]) return;

  const path = join(dataDir(), "session-secret");
  if (!existsSync(path)) writeFileSync(path, randomBytes(32).toString("hex"), { mode: 0o600 });
  process.env["NUXT_SESSION_PASSWORD"] = readFileSync(path, "utf8").trim();
}
