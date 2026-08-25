import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { canConnect, moduleIds, supportsKind, appliesIn } from "../src/index.js";
import { loadRegistry } from "../src/registry-fs.js";

// The real registry, so these tests break when a manifest does — which is the
// point of having the manifests be the catalogue.
const REGISTRY_DIR = fileURLToPath(new URL("../../../registry", import.meta.url));

describe("the registry", () => {
  it("loads every module manifest in the repository", async () => {
    const reg = await loadRegistry(REGISTRY_DIR);
    for (const want of ["vue-legal-docs-import", "legal-annotation-kit", "vue-iaa-metrics"]) {
      expect(reg.modules[want], `registry is missing ${want}`).toBeDefined();
    }
    expect(moduleIds(reg)).toEqual([...moduleIds(reg)].sort());
  });

  it("connects identical types and refuses unrelated ones", async () => {
    const reg = await loadRegistry(REGISTRY_DIR);
    expect(canConnect(reg, "corpus@1", "corpus@1")).toBe(true);
    expect(canConnect(reg, "corpus@1", "annotated-task@1")).toBe(false);
  });

  // Search results are cases; a corpus is documents to work on. Bridging them
  // means fetching each judgment, which is a step of its own — so this must
  // stay refused until the preprocessing module exists to do it.
  it("does not let search feed an annotation step directly", async () => {
    const reg = await loadRegistry(REGISTRY_DIR);
    expect(canConnect(reg, "document-set@1", "corpus@1")).toBe(false);
  });

  it("knows which kinds each module belongs in", async () => {
    const reg = await loadRegistry(REGISTRY_DIR);
    const download = reg.modules["results-download"]!;
    expect(supportsKind(download, "pipeline")).toBe(true);
    // Nothing to download from a platform that already stored the work.
    expect(supportsKind(download, "workspace")).toBe(false);

    const kit = reg.modules["legal-annotation-kit"]!;
    expect(supportsKind(kit, "pipeline")).toBe(true);
    expect(supportsKind(kit, "workspace")).toBe(true);
  });

  // The whole migration from "one exported platform = one task": these
  // settings are the composer's business only where there is no screen for
  // making tasks.
  it("scopes the annotate step's task settings to pipelines", async () => {
    const reg = await loadRegistry(REGISTRY_DIR);
    const kit = reg.modules["legal-annotation-kit"]!;
    for (const key of ["task_name", "labels", "annotation_level", "annotators"]) {
      const field = kit.config?.find((f) => f.key === key);
      expect(field, `${key} is missing from the manifest`).toBeDefined();
      expect(appliesIn(field!, "pipeline")).toBe(true);
      expect(appliesIn(field!, "workspace")).toBe(false);
    }
  });
});
