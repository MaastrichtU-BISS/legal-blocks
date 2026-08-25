// Reading a registry off disk.
//
// Kept apart from buildRegistry so the checks are testable without a
// filesystem, and so a bundler that inlines the manifests can use the same
// validation the directory read does.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistry, type Registry } from "./manifest.js";

/**
 * Loads every *.module.json in `dir` as a module, plus adapters.json.
 */
export async function loadRegistry(dir: string): Promise<Registry> {
  const entries = await readdir(dir, { withFileTypes: true });

  const manifests: unknown[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory() || !e.name.endsWith(".module.json")) continue;
    manifests.push(await readJSON(join(dir, e.name)));
  }

  return buildRegistry(manifests, await readJSON(join(dir, "adapters.json")));
}

async function readJSON(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`parsing ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
