// The secret the platform signs ML requests with.
//
// Made on first use and kept in a file on a volume of its own, which the ML
// containers mount read-only. legal-ml-core reads the file on every request,
// so it does not matter which side starts first. LEGAL_BLOCKS_ML_SECRET wins,
// for a deployment that sets the secret on both sides itself.

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function mlSecret(path: string): string {
  const given = process.env["LEGAL_BLOCKS_ML_SECRET"]?.trim();
  if (given) return given;

  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    // "wx" so two requests racing to make it cannot leave two different
    // secrets behind: the loser's write fails and it reads the winner's.
    try {
      writeFileSync(path, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  return readFileSync(path, "utf8").trim();
}
