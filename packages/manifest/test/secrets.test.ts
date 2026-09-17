import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { Pipeline, Registry } from "../src/index.js";
import {
  dropHiddenSettings,
  parsePipeline,
  splitSecrets,
  upstreams,
} from "../src/index.js";
import { loadRegistry } from "../src/registry-fs.js";

const REGISTRY_DIR = fileURLToPath(new URL("../../../registry", import.meta.url));

let reg: Registry;
beforeAll(async () => {
  reg = await loadRegistry(REGISTRY_DIR);
});

function searching(
  token: string,
  baseUrl?: string,
  extra: Record<string, unknown> = {},
): Pipeline {
  const config: Record<string, unknown> = { title: "Find documents", api_token: token, ...extra };
  if (baseUrl !== undefined) config["api_base_url"] = baseUrl;
  return parsePipeline(
    JSON.stringify({
      version: 1,
      name: "Find cases",
      kind: "pipeline",
      nodes: [
        { id: "search", module: "vue-legal-query-builder", config },
        { id: "explore", module: "vue-legal-docs-visualizer" },
      ],
    }),
    reg,
  );
}

describe("splitting secrets out of a pipeline", () => {
  // pipeline.json is served to every browser that opens the platform. A token
  // travelling inside it would reach all of them.
  it("removes the token from the pipeline and returns it separately", () => {
    const { clean, secrets } = splitSecrets(searching("secret-value"), reg);

    expect(secrets["search"]?.["api_token"]).toBe("secret-value");
    expect(JSON.stringify(clean)).not.toContain("secret-value");
    // Everything that is not a credential stays where it was.
    expect(clean.nodes[0]?.config?.["title"]).toBe("Find documents");
  });

  it("leaves a pipeline with no secrets untouched", () => {
    const p = parsePipeline(
      `{"kind":"workspace","nodes":[{"id":"docs","module":"vue-legal-docs-import"}]}`,
      reg,
    );
    const { clean, secrets } = splitSecrets(p, reg);
    expect(secrets).toEqual({});
    expect(clean.nodes[0]).toBe(p.nodes[0]);
  });

  // An empty box in the composer is not a credential. Recording it would put
  // an empty credentials.json in the export and imply there is a key in it.
  it("does not record an empty token", () => {
    const { secrets } = splitSecrets(searching(""), reg);
    expect(secrets).toEqual({});
  });

  it("does not mutate the pipeline it was given", () => {
    const p = searching("secret-value");
    splitSecrets(p, reg);
    expect(p.nodes[0]?.config?.["api_token"]).toBe("secret-value");
  });
});

describe("resolving upstreams", () => {
  it("pairs the service with the address and the token", () => {
    const p = searching("secret-value", "https://example.invalid/api");
    const { secrets } = splitSecrets(p, reg);
    const [up] = upstreams(p, reg, secrets);

    expect(up?.service).toBe("legal-docs");
    expect(up?.baseUrl).toBe("https://example.invalid/api");
    expect(up?.token).toBe("secret-value");
    // A deployment can supply the token at run time instead of shipping it.
    expect(up?.envVar).toBe("CITATIONS_API_KEY");
  });

  // A node whose address was never edited still has to reach the hosted
  // service, so the manifest's own default stands in.
  it("falls back to the manifest default address", () => {
    const p = searching("secret-value");
    const { secrets } = splitSecrets(p, reg);
    expect(upstreams(p, reg, secrets)[0]?.baseUrl).toBe("https://api.caselawexplorer.tech/api");
  });

  it("lists nothing for a pipeline that calls no outside API", () => {
    const p = parsePipeline(
      `{"kind":"workspace","nodes":[{"id":"docs","module":"vue-legal-docs-import"}]}`,
      reg,
    );
    expect(upstreams(p, reg, {})).toEqual([]);
  });
});

describe("dropping hidden settings", () => {
  it("hides what depends on a hidden setting", () => {
    const p = dropHiddenSettings(
      searching("", undefined, {
        mode: "free-form",
        guided_source: "upload",
        guided_structure: '{"goals":[]}',
        guided_template: "caselaw-search",
      }),
      reg,
    );
    const config = p.nodes[0]?.config ?? {};
    expect(config).not.toHaveProperty("guided_source");
    expect(config).not.toHaveProperty("guided_structure");
    expect(config).not.toHaveProperty("guided_template");
    expect(config["mode"]).toBe("free-form");
  });

  it("keeps the uploaded structure and drops the template when uploading", () => {
    const p = dropHiddenSettings(
      searching("", undefined, {
        mode: "guided",
        guided_source: "upload",
        guided_structure: '{"goals":[]}',
        guided_template: "caselaw-search",
      }),
      reg,
    );
    const config = p.nodes[0]?.config ?? {};
    expect(config["guided_structure"]).toBe('{"goals":[]}');
    expect(config).not.toHaveProperty("guided_template");
  });

  // Written before there was a structure source to choose: whatever it held
  // was in use, and an upgrade must not quietly drop it.
  it("keeps settings whose condition was never recorded", () => {
    const p = dropHiddenSettings(
      searching("secret-value", undefined, { mode: "guided", guided_structure: '{"goals":[]}' }),
      reg,
    );
    expect(p.nodes[0]?.config?.["guided_structure"]).toBe('{"goals":[]}');
  });
});
