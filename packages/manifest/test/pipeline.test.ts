import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { Registry } from "../src/index.js";
import { exportKind, order, parsePipeline, serviceIds } from "../src/index.js";
import { loadRegistry } from "../src/registry-fs.js";

const REGISTRY_DIR = fileURLToPath(new URL("../../../registry", import.meta.url));

let reg: Registry;
beforeAll(async () => {
  reg = await loadRegistry(REGISTRY_DIR);
});

/** The flagship: documents in, annotate, measure agreement. */
const flagship = `{
  "version": 1,
  "name": "Annotate and measure",
  "nodes": [
    {"id": "docs", "module": "vue-legal-docs-import", "label": "Documents"},
    {"id": "annotate", "module": "legal-annotation-kit", "label": "Annotate",
     "config": {"labels": "Actor, Act", "annotators": 2, "annotation_level": "word"}},
    {"id": "metrics", "module": "vue-iaa-metrics", "label": "Metrics"}
  ],
  "edges": [
    {"from": {"node": "docs", "port": "corpus"}, "to": {"node": "annotate", "port": "corpus"}},
    {"from": {"node": "annotate", "port": "task"}, "to": {"node": "metrics", "port": "task"}}
  ]
}`;

/** A case-law explorer: search and view, nothing stored. */
const explorer = `{
  "version": 1,
  "name": "Case-law explorer",
  "kind": "pipeline",
  "nodes": [
    {"id": "search", "module": "vue-legal-query-builder", "label": "Search"},
    {"id": "explore", "module": "vue-legal-docs-visualizer", "label": "Explore"}
  ],
  "edges": [
    {"from": {"node": "search", "port": "documents"}, "to": {"node": "explore", "port": "documents"}}
  ]
}`;

describe("a valid pipeline", () => {
  it("orders steps after the steps feeding them, and mounts only the services used", () => {
    const p = parsePipeline(flagship, reg);
    expect(order(p).join(",")).toBe("docs,annotate,metrics");
    expect(serviceIds(p, reg).join(",")).toBe("docs-import,lawnotation-iaa");
  });

  // A file written before the kind field existed must keep behaving as it did.
  it("defaults to a workspace when no kind is given", () => {
    expect(exportKind(parsePipeline(flagship, reg))).toBe("workspace");
  });

  // Storing nothing does not mean running nothing: searching happens on the
  // server, because that is where the access token lives. An explorer has no
  // database and still has a backend.
  it("gives a pipeline that stores nothing a backend anyway", () => {
    const p = parsePipeline(explorer, reg);
    expect(exportKind(p)).toBe("pipeline");
    expect(serviceIds(p, reg)).toEqual(["legal-docs"]);
  });

  // In a workspace the annotate tool's documents come from the task somebody
  // opened, not from whatever is upstream. Insisting on an edge would mean
  // drawing one that lies about where the documents come from.
  it("accepts a workspace with no edges at all", () => {
    expect(() =>
      parsePipeline(
        `{"kind":"workspace","nodes":[
          {"id":"upload","module":"vue-legal-docs-import"},
          {"id":"annotate","module":"legal-annotation-kit"},
          {"id":"metrics","module":"vue-iaa-metrics"}],
         "edges":[]}`,
        reg,
      ),
    ).not.toThrow();
  });
});

describe("validation", () => {
  const cases: Record<string, { json: string; wantError: string }> = {
    "metrics before annotate": {
      json: `{"nodes":[
        {"id":"docs","module":"vue-legal-docs-import"},
        {"id":"metrics","module":"vue-iaa-metrics"}],
       "edges":[{"from":{"node":"docs","port":"corpus"},"to":{"node":"metrics","port":"task"}}]}`,
      wantError: "no adapter declared",
    },
    // Only in a pipeline. In a workspace the task a tool is opened against
    // supplies what it needs, so an unconnected input is normal.
    "required input unconnected": {
      json: `{"kind":"pipeline","nodes":[{"id":"metrics","module":"vue-iaa-metrics"}],"edges":[]}`,
      wantError: "required input",
    },
    "unknown module": {
      json: `{"nodes":[{"id":"x","module":"does-not-exist"}],"edges":[]}`,
      wantError: "unknown module",
    },
    "unknown port": {
      json: `{"nodes":[
        {"id":"docs","module":"vue-legal-docs-import"},
        {"id":"annotate","module":"legal-annotation-kit"}],
       "edges":[{"from":{"node":"docs","port":"nope"},"to":{"node":"annotate","port":"corpus"}}]}`,
      wantError: "no output port",
    },
    "duplicate node id": {
      json: `{"nodes":[
        {"id":"docs","module":"vue-legal-docs-import"},
        {"id":"docs","module":"vue-legal-docs-import"}],"edges":[]}`,
      wantError: "duplicate node id",
    },
    "unknown kind": {
      json: `{"kind":"sometimes","nodes":[{"id":"d","module":"vue-legal-docs-import"}],"edges":[]}`,
      wantError: "expected pipeline or workspace",
    },
    // results-download only makes sense when nothing is stored, so an export
    // can never promise a screen that will not function.
    "download step in a workspace": {
      json: `{"kind":"workspace","nodes":[
        {"id":"docs","module":"vue-legal-docs-import"},
        {"id":"annotate","module":"legal-annotation-kit"},
        {"id":"save","module":"results-download"}],
       "edges":[
        {"from":{"node":"docs","port":"corpus"},"to":{"node":"annotate","port":"corpus"}},
        {"from":{"node":"annotate","port":"task"},"to":{"node":"save","port":"task"}}]}`,
      wantError: "does not belong in a workspace",
    },
  };

  for (const [name, { json, wantError }] of Object.entries(cases)) {
    it(`rejects ${name}`, () => {
      expect(() => parsePipeline(json, reg)).toThrow(wantError);
    });
  }

  // Refusing is only half of it: someone wiring search into annotation has a
  // reasonable idea and is missing a piece, and the message has to say which.
  it("says what is missing when search is wired into annotation", () => {
    expect(() =>
      parsePipeline(
        `{"kind":"pipeline","nodes":[
          {"id":"search","module":"vue-legal-query-builder"},
          {"id":"annotate","module":"legal-annotation-kit"}],
         "edges":[{"from":{"node":"search","port":"documents"},"to":{"node":"annotate","port":"corpus"}}]}`,
        reg,
      ),
    ).toThrow(/preprocessing/);
  });

  // A hand-edited pipeline.json must not be able to make the runtime loop
  // while resolving inputs, even though the composer only draws linear chains.
  it("rejects cycles", () => {
    expect(() =>
      parsePipeline(
        `{"nodes":[
          {"id":"a","module":"vue-legal-docs-visualizer"},
          {"id":"b","module":"vue-legal-docs-visualizer"}],
         "edges":[
          {"from":{"node":"a","port":"documents"},"to":{"node":"b","port":"documents"}},
          {"from":{"node":"b","port":"documents"},"to":{"node":"a","port":"documents"}}]}`,
        reg,
      ),
    ).toThrow(/cycle/);
  });

  it("refuses to connect one input twice", () => {
    expect(() =>
      parsePipeline(
        `{"kind":"pipeline","nodes":[
          {"id":"a","module":"vue-legal-query-builder"},
          {"id":"b","module":"vue-legal-query-builder"},
          {"id":"v","module":"vue-legal-docs-visualizer"}],
         "edges":[
          {"from":{"node":"a","port":"documents"},"to":{"node":"v","port":"documents"}},
          {"from":{"node":"b","port":"documents"},"to":{"node":"v","port":"documents"}}]}`,
        reg,
      ),
    ).toThrow(/connected more than once/);
  });
});
