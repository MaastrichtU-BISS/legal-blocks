import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { Registry } from "../src/index.js";
import { describeUnmet, exportKind, order, parsePipeline, requiresLogin, serviceIds, unmetInputs } from "../src/index.js";
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
  ]
}`;

describe("a valid pipeline", () => {
  it("runs steps in the order they are written, and mounts only the services used", () => {
    const p = parsePipeline(flagship, reg);
    expect(order(p).join(",")).toBe("docs,annotate,metrics");
    expect(serviceIds(p, reg).join(",")).toBe("docs-import,lawnotation-iaa");
  });

  // A file written before the kind field existed must keep behaving as it did.
  it("defaults to a workspace when no kind is given", () => {
    expect(exportKind(parsePipeline(flagship, reg))).toBe("workspace");
  });

  it("asks nobody to sign in unless login is set", () => {
    expect(requiresLogin(parsePipeline(flagship, reg))).toBe(false);
    const p = parsePipeline({ ...JSON.parse(explorer), login: true }, reg);
    expect(requiresLogin(p)).toBe(true);
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
  // opened, not from the tool listed before it. Nothing flows between them, so
  // an order that would be nonsense in a pipeline is fine here.
  it("accepts a workspace whose tools could not feed each other", () => {
    expect(() =>
      parsePipeline(
        `{"kind":"workspace","nodes":[
          {"id":"metrics","module":"vue-iaa-metrics"},
          {"id":"upload","module":"vue-legal-docs-import"},
          {"id":"annotate","module":"legal-annotation-kit"}]}`,
        reg,
      ),
    ).not.toThrow();
  });
});

describe("reading a pipeline written when this was a graph", () => {
  // An export's compose file invites upgrading by changing an image tag, so
  // old files meet new platforms. Back then the runtime laid steps out in
  // dependency order rather than array order — so a file whose nodes are in a
  // different order from its edges has to come back in the order it ran in,
  // not the order it was stored in.
  const legacy = `{
    "version": 1, "name": "Old", "kind": "pipeline",
    "nodes": [
      {"id": "explore", "module": "vue-legal-docs-visualizer"},
      {"id": "search", "module": "vue-legal-query-builder"}
    ],
    "edges": [
      {"from": {"node": "search", "port": "documents"}, "to": {"node": "explore", "port": "documents"}}
    ]
  }`;

  it("puts the steps in the order its edges implied", () => {
    expect(order(parsePipeline(legacy, reg)).join(",")).toBe("search,explore");
  });

  it("keeps no edges once read", () => {
    expect(parsePipeline(legacy, reg)).not.toHaveProperty("edges");
  });

  // Reordering happens before validation, so a legacy file that was valid as a
  // graph stays valid as a list rather than failing on the order it was
  // written in.
  it("accepts one that would not validate in its stored order", () => {
    expect(() => parsePipeline(legacy, reg)).not.toThrow();
  });
});

describe("validation", () => {
  const cases: Record<string, { json: string; wantError: string }> = {
    // Only in a pipeline. In a workspace the task a tool is opened against
    // supplies what it needs, so a tool that reads nothing before it is fine.
    "metrics before annotate": {
      json: `{"kind":"pipeline","nodes":[
        {"id":"docs","module":"vue-legal-docs-import"},
        {"id":"metrics","module":"vue-iaa-metrics"}]}`,
      wantError: "no adapter declared",
    },
    "a first step that needs input": {
      json: `{"kind":"pipeline","nodes":[{"id":"metrics","module":"vue-iaa-metrics"}]}`,
      wantError: "it is the first step",
    },
    "unknown module": {
      json: `{"nodes":[{"id":"x","module":"does-not-exist"}]}`,
      wantError: "unknown module",
    },
    "duplicate node id": {
      json: `{"nodes":[
        {"id":"docs","module":"vue-legal-docs-import"},
        {"id":"docs","module":"vue-legal-docs-import"}]}`,
      wantError: "duplicate node id",
    },
    "unknown kind": {
      json: `{"kind":"sometimes","nodes":[{"id":"d","module":"vue-legal-docs-import"}]}`,
      wantError: "expected pipeline or workspace",
    },
    "a login that is not a boolean": {
      json: `{"login":"yes","nodes":[{"id":"d","module":"vue-legal-docs-import"}]}`,
      wantError: "login must be true or false",
    },
  };

  for (const [name, { json, wantError }] of Object.entries(cases)) {
    it(`rejects ${name}`, () => {
      expect(() => parsePipeline(json, reg)).toThrow(wantError);
    });
  }

  // Refusing is only half of it: someone putting annotation after search has a
  // reasonable idea and is missing a piece, and the message has to say which.
  it("says what is missing when annotation follows search", () => {
    expect(() =>
      parsePipeline(
        `{"kind":"pipeline","nodes":[
          {"id":"search","module":"vue-legal-query-builder"},
          {"id":"annotate","module":"legal-annotation-kit"}]}`,
        reg,
      ),
    ).toThrow(/preprocessing/);
  });

  // The message has to name both ends. "Cannot connect" without saying which
  // step produces what leaves someone counting steps to find the join.
  it("names the step in front when the types do not meet", () => {
    expect(() =>
      parsePipeline(
        `{"kind":"pipeline","nodes":[
          {"id":"docs","module":"vue-legal-docs-import"},
          {"id":"metrics","module":"vue-iaa-metrics"}]}`,
        reg,
      ),
    ).toThrow(/step "metrics" needs annotated-task@1.*"docs".*corpus@1/s);
  });
});

describe("what a stored platform needs", () => {
  const workspace = (nodes: string[]) =>
    parsePipeline(
      JSON.stringify({
        version: 1,
        name: "W",
        kind: "workspace",
        nodes: nodes.map((module, i) => ({ id: `n${i}`, module })),
      }),
      reg,
    );

  it("is satisfied when every tool's input comes from another tool", () => {
    expect(unmetInputs(parsePipeline(flagship, reg), reg)).toEqual([]);
  });

  it("names a tool with nothing to read and what would feed it", () => {
    const [unmet, ...rest] = unmetInputs(workspace(["legal-annotation-kit"]), reg);
    expect(rest).toEqual([]);
    expect(describeUnmet(unmet!)).toMatch(/^Annotate needs documents, but nothing in this platform provides them\. Add .*Import documents/);
  });

  it("does not count a tool passing its own input on as a source of it", () => {
    const unmet = unmetInputs(workspace(["vue-legal-docs-visualizer"]), reg);
    expect(unmet.map((u) => u.module.id)).toEqual(["vue-legal-docs-visualizer"]);
  });

  it("follows a chain inside the workspace", () => {
    const unmet = unmetInputs(workspace(["legal-annotation-kit", "vue-iaa-metrics"]), reg);
    expect(unmet.map((u) => u.module.id)).toEqual(["legal-annotation-kit"]);
  });

  it("asks Train models for documents to train on, like Annotate", () => {
    const [unmet] = unmetInputs(workspace(["vue-legal-ml-builder"]), reg);
    expect(describeUnmet(unmet!)).toMatch(/^Train models needs documents.*Import documents/);
    expect(unmetInputs(workspace(["vue-legal-docs-import", "vue-legal-ml-builder"]), reg)).toEqual([]);
  });

  it("asks nothing of a pipeline, which cannot be built this way", () => {
    expect(unmetInputs(parsePipeline(explorer, reg), reg)).toEqual([]);
  });
});

describe("search to annotation", () => {
  it("goes through Get full text, never straight across", () => {
    const chain = (modules: string[]) =>
      JSON.stringify({
        version: 1,
        name: "S",
        kind: "pipeline",
        nodes: modules.map((module, i) => ({ id: `n${i}`, module })),
      });
    expect(() =>
      parsePipeline(chain(["vue-legal-query-builder", "legal-blocks-full-text", "legal-annotation-kit"]), reg),
    ).not.toThrow();
    expect(() => parsePipeline(chain(["vue-legal-query-builder", "legal-annotation-kit"]), reg)).toThrow();
  });

  it("lets a stored platform annotate judgments a search found", () => {
    const p = parsePipeline(
      JSON.stringify({
        version: 1,
        name: "S",
        kind: "workspace",
        nodes: [
          { id: "s", module: "vue-legal-query-builder" },
          { id: "t", module: "legal-blocks-full-text" },
          { id: "a", module: "legal-annotation-kit" },
        ],
      }),
      reg,
    );
    expect(unmetInputs(p, reg)).toEqual([]);
  });
});
