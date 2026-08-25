import { beforeAll, describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { fileURLToPath } from "node:url";
import { parsePipeline, type Registry } from "@legal-blocks/manifest";
import { loadRegistry } from "@legal-blocks/manifest/fs";
import { buildExport, exportFilename } from "../src/index.js";

const REGISTRY_DIR = fileURLToPath(new URL("../../../registry", import.meta.url));
const PLATFORM = "ghcr.io/example/legal-blocks-platform:1.2.3";
const IAA = "ghcr.io/example/lawnotation-iaa:1.2.3";

let reg: Registry;
beforeAll(async () => {
  reg = await loadRegistry(REGISTRY_DIR);
});

/** A stored platform with agreement metrics — so it needs the sidecar. */
const workspace = `{"version":1,"name":"My workspace","kind":"workspace","nodes":[
  {"id":"import1","module":"vue-legal-docs-import"},
  {"id":"annot1","module":"legal-annotation-kit"},
  {"id":"iaa1","module":"vue-iaa-metrics"}],"edges":[]}`;

/** Search and view: no storage, no agreement service, and a token. */
const searching = `{"version":1,"name":"Find cases","kind":"pipeline","nodes":[
  {"id":"search1","module":"vue-legal-query-builder",
   "config":{"api_token":"secret-value","api_base_url":"https://example.invalid"}},
  {"id":"viz1","module":"vue-legal-docs-visualizer"}],
 "edges":[{"from":{"node":"search1","port":"documents"},"to":{"node":"viz1","port":"documents"}}]}`;

function build(body: string): Record<string, string> {
  const zip = buildExport({
    pipeline: parsePipeline(body, reg),
    registry: reg,
    platformImage: PLATFORM,
    iaaImage: IAA,
  });
  const out: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(unzipSync(zip))) out[name] = strFromU8(bytes);
  return out;
}

describe("what an export contains", () => {
  it("is a compose file and the pipeline, not a program", () => {
    const files = build(workspace);
    expect(Object.keys(files).sort()).toEqual([
      "README.txt",
      "docker-compose.yml",
      "pipeline.json",
    ]);
  });

  it("names the images it was built with", () => {
    const compose = build(workspace)["docker-compose.yml"]!;
    expect(compose).toContain(`image: ${PLATFORM}`);
    expect(compose).toContain(`image: ${IAA}`);
  });

  // The agreement service is a whole extra container. A platform that never
  // computes agreement should not make somebody pull and run one.
  it("only ships the agreement service when the pipeline uses it", () => {
    expect(build(searching)["docker-compose.yml"]).not.toContain("agreement");
    expect(build(workspace)["docker-compose.yml"]).toContain("agreement:");
  });

  // The platform has no login, so anything that can reach the port can read
  // and write everyone's work.
  it("publishes the platform on localhost only, and the sidecar not at all", () => {
    const compose = build(workspace)["docker-compose.yml"]!;
    expect(compose).toContain('"127.0.0.1:7777:7777"');
    // One ports: block, belonging to the platform.
    expect(compose.match(/ports:/g)).toHaveLength(1);
  });

  // "Copy the data folder to back up your work" has to be true.
  it("stores work in a folder the user can see", () => {
    expect(build(workspace)["docker-compose.yml"]).toContain("./data:/app/data");
    expect(build(workspace)["README.txt"]).toContain('"data" folder');
  });

  it("separates credentials, and mounts them only when they exist", () => {
    const withToken = build(searching);
    expect(withToken["credentials.json"]).toContain("secret-value");
    expect(withToken["pipeline.json"]).not.toContain("secret-value");
    expect(withToken["docker-compose.yml"]).toContain("credentials.json:/app/credentials.json:ro");
    expect(withToken["README.txt"]).toContain("credentials.json");

    // Compose creates a directory where a bind source is missing, so an
    // unconditional mount is worse than no mount.
    expect(build(workspace)["docker-compose.yml"]).not.toContain("credentials.json");
  });

  it("tells the reader where work goes, and it differs by kind", () => {
    expect(build(workspace)["README.txt"]).toContain('saved in the "data" folder');
    expect(build(searching)["README.txt"]).toContain("does not save anything");
  });

  it("lists the steps in the order they run", () => {
    expect(build(searching)["README.txt"]).toMatch(/1\. .*\n\s*2\. /);
  });
});

describe("the filename", () => {
  it("is safe", () => {
    expect(exportFilename("My workspace")).toBe("my-workspace.zip");
    expect(exportFilename("  Trim  me  ")).toBe("trim--me.zip");
    expect(exportFilename("!!!")).toBe("platform.zip");
    // Dropped rather than replaced, so a path separator cannot survive.
    expect(exportFilename("Ünïcödé/paths")).toBe("ncdpaths.zip");
  });
});
