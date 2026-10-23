#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || process.cwd());
const registryDir = path.join(root, "registry");

// Collect known module ids and package names from manifests.
const moduleNames = new Set();
for (const f of fs.readdirSync(registryDir)) {
  if (!f.endsWith(".module.json")) continue;
  const m = JSON.parse(fs.readFileSync(path.join(registryDir, f), "utf8"));
  if (m.id) moduleNames.add(m.id);
  if (m.entry?.package) moduleNames.add(m.entry.package);
}
const names = [...moduleNames].sort();

const roots = ["apps/composer", "layers/base", "apps/platform"].map((p) =>
  path.join(root, p),
);

const allowedFile = (rel) => {
  if (rel.startsWith("registry/")) return true;
  if (rel === "layers/base/app/modules/loaders.ts") return true;
  if (rel.startsWith("layers/base/app/runtime/bindings/")) return true;
  if (rel.startsWith("layers/base/app/sources/")) return true;
  if (rel.startsWith("apps/platform/dev/")) return true;
  if (rel.startsWith("packages/")) return true;
  return false;
};

const codeExts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"]);

const skipDirs = new Set(["node_modules", ".git", ".nuxt", ".output", "dist", ".cache", "coverage"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (codeExts.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

function stripComments(line) {
  return line
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/g, "");
}

let violations = [];
for (const r of roots) {
  for (const file of walk(r)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (allowedFile(rel)) continue;
    const raw = fs.readFileSync(file, "utf8");
    const noBlocks = raw
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
    const lines = noBlocks.split(/\r?\n/);
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/g, "");
      for (const name of names) {
        if (code.includes(name)) {
          violations.push({ file: rel, line: i + 1, name, text: line.trim() });
        }
      }
    });
  }
}

if (violations.length) {
  console.error("Hardcoded module name(s) found in composer/runtime code:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.name}]  ${v.text}`);
  }
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}
console.log(`check-no-hardcoded-modules: OK (${names.length} module names, ${roots.length} roots)`);
