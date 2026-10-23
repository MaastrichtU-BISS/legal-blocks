import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "../../../packages/manifest/src/registry-fs.js";
import type { Pipeline, Registry } from "../app/types.js";
import { contextFor, produce } from "../app/runtime/resolve.js";

const REGISTRY_DIR = fileURLToPath(new URL("../../../registry", import.meta.url));

let registry: Registry;

beforeEach(async () => {
  registry = await loadRegistry(REGISTRY_DIR);
});

function env(pipeline: Pipeline, overrides: Partial<{
  kind: "pipeline" | "workspace";
  annotator: number;
  taskId?: number;
}> = {}) {
  const produced: string[] = [];
  const e = {
    pipeline,
    registry,
    kind: overrides.kind ?? "pipeline",
    annotator: overrides.annotator ?? 1,
    taskId: overrides.taskId,
    refresh: () => {},
    produced: (nodeId: string) => produced.push(nodeId),
  };
  return { env: e, produced };
}

describe("produce", () => {
  it("returns a single step's output", async () => {
    const pipeline: Pipeline = {
      version: 1,
      name: "p",
      kind: "pipeline",
      nodes: [{ id: "import", module: "vue-legal-docs-import", label: "Import" }],
    };
    const { env: e } = env(pipeline);
    const out = await produce(e, "import", "corpus");
    expect(out).toEqual({ kind: "documents", documents: [] });
  });

  it("chains produce through the previous step", async () => {
    const pipeline: Pipeline = {
      version: 1,
      name: "p",
      kind: "pipeline",
      nodes: [
        { id: "import", module: "vue-legal-docs-import", label: "Import" },
        { id: "annotate", module: "legal-annotation-kit", label: "Annotate" },
      ],
    };
    const { env: e } = env(pipeline);
    const out = (await produce(e, "annotate", "task")) as { kind: string; nodeId: string };
    expect(out.kind).toBe("session");
    expect(out.nodeId).toBe("annotate");
  });

  it("chains three steps", async () => {
    const pipeline: Pipeline = {
      version: 1,
      name: "p",
      kind: "pipeline",
      nodes: [
        { id: "import", module: "vue-legal-docs-import", label: "Import" },
        { id: "annotate", module: "legal-annotation-kit", label: "Annotate" },
        { id: "metrics", module: "vue-iaa-metrics", label: "Metrics" },
      ],
    };
    const { env: e } = env(pipeline);
    const out = (await produce(e, "metrics", "task")) as { kind: string; nodeId: string };
    expect(out.kind).toBe("session");
    expect(out.nodeId).toBe("annotate");
  });

  it("throws for an unknown node", async () => {
    const pipeline: Pipeline = { version: 1, name: "p", kind: "pipeline", nodes: [] };
    const { env: e } = env(pipeline);
    await expect(produce(e, "nope", "corpus")).rejects.toThrow(/unknown node/);
  });

  it("throws for an unknown module", async () => {
    const pipeline: Pipeline = {
      version: 1,
      name: "p",
      kind: "pipeline",
      nodes: [{ id: "x", module: "does-not-exist", label: "X" }],
    };
    const { env: e } = env(pipeline);
    await expect(produce(e, "x", "corpus")).rejects.toThrow(/unknown module/);
  });
});

describe("resolveInput via context", () => {
  it("throws when the step is first", async () => {
    const pipeline: Pipeline = {
      version: 1,
      name: "p",
      kind: "pipeline",
      nodes: [{ id: "import", module: "vue-legal-docs-import", label: "Import" }],
    };
    const { env: e } = env(pipeline);
    const ctx = contextFor(e, "import");
    await expect(ctx.input("corpus")).rejects.toThrow(/is first/);
  });

  it("throws when previous step produces nothing readable", async () => {
    const pipeline: Pipeline = {
      version: 1,
      name: "p",
      kind: "pipeline",
      nodes: [
        { id: "import", module: "vue-legal-docs-import", label: "Import" },
        { id: "view", module: "vue-legal-docs-visualizer", label: "View" },
      ],
    };
    const { env: e } = env(pipeline);
    const ctx = contextFor(e, "view");
    await expect(ctx.input("documents")).rejects.toThrow(/produces nothing/);
  });

  it("resolves the previous step's output when types match", async () => {
    const pipeline: Pipeline = {
      version: 1,
      name: "p",
      kind: "pipeline",
      nodes: [
        { id: "search", module: "vue-legal-query-builder", label: "Search" },
        { id: "view", module: "vue-legal-docs-visualizer", label: "View" },
      ],
    };
    const { env: e } = env(pipeline);
    const ctx = contextFor(e, "view");
    const value = await ctx.input("documents");
    expect(value).toMatchObject({ kind: "results", nodes: [], edges: [] });
  });
});

describe("contextFor", () => {
  it("wires produced() to env.produced(nodeId)", () => {
    const pipeline: Pipeline = {
      version: 1,
      name: "p",
      kind: "pipeline",
      nodes: [{ id: "import", module: "vue-legal-docs-import", label: "Import" }],
    };
    const { env: e, produced } = env(pipeline);
    const ctx = contextFor(e, "import");
    ctx.produced();
    expect(produced).toEqual(["import"]);
  });

  it("fills config defaults", () => {
    const pipeline: Pipeline = {
      version: 1,
      name: "p",
      kind: "pipeline",
      nodes: [{ id: "import", module: "vue-legal-docs-import", label: "Import" }],
    };
    const { env: e } = env(pipeline);
    const ctx = contextFor(e, "import");
    expect(ctx.config.dataset_name).toBe("Uploaded documents");
  });
});

describe("empty and edge cases", () => {
  it("produce on empty pipeline throws", async () => {
    const pipeline: Pipeline = { version: 1, name: "p", kind: "pipeline", nodes: [] };
    const { env: e } = env(pipeline);
    await expect(produce(e, "anything", "corpus")).rejects.toThrow();
  });
});
