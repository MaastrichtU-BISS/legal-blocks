#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let tracked = "";
try {
  tracked = execFileSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "buffer",
  }).toString("utf8");
} catch (err) {
  console.error("check-no-artifacts: failed to run git ls-files");
  console.error(err?.stderr?.toString?.() || err?.message || err);
  process.exit(2);
}

const files = tracked.split("\0").filter(Boolean);

const ARTIFACT_DIRS = new Set([
  ".nuxt",
  ".output",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);

const isArtifact = (file) => {
  const normalized = file.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.some((p) => ARTIFACT_DIRS.has(p))) return true;
  const base = parts[parts.length - 1];
  if (base.endsWith(".tsbuildinfo")) return true;
  return false;
};

const artifacts = files.filter(isArtifact);

if (artifacts.length > 0) {
  console.error("Build artifacts are tracked in git:");
  for (const f of artifacts) console.error(`  ${f}`);
  console.error("\nRemove them with: git rm -r --cached <path>");
  process.exit(1);
}

console.log("No tracked build artifacts. OK");