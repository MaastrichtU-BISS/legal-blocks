import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forwardToMl, MlFailure, ML_NOT_RUNNING, type MlRequest } from "../server/ml/forward";
import { mlSecret } from "../server/ml/secret";
import { ML_TOKEN_LIFETIME_SECONDS, signMlToken } from "../server/ml/token";

const SECRET = "test-secret";

/** What legal-ml-core checks in platform mode, and nothing more. */
function verify(token: string): { sub: string; iat: number; exp: number } {
  const [header, payload, signature] = token.split(".");
  const expected = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  if (signature !== expected) throw new Error("bad signature");
  return JSON.parse(Buffer.from(payload!, "base64url").toString());
}

/**
 * A stand-in for the ML service: datasets scoped by the token's subject, the
 * way legal-ml-core scopes them, plus a few paths that answer as it refuses.
 */
let server: Server;
let base: string;
const datasets = new Map<string, string[]>();

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    let owner: string;
    try {
      owner = verify((req.headers.authorization ?? "").replace(/^Bearer /, "")).sub;
    } catch {
      return reply(401, { error: "Invalid platform token" });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString();

    if (req.url === "/api/datasets/upload" && req.method === "POST") {
      const name = /name="name"\r\n\r\n([^\r]*)/.exec(body)?.[1] ?? "?";
      datasets.set(owner, [...(datasets.get(owner) ?? []), name]);
      return reply(201, { dataset: { name } });
    }
    if (req.url === "/api/datasets/") return reply(200, { datasets: datasets.get(owner) ?? [] });
    if (req.url === "/api/models/") return reply(400, { error: "Pick a model type.", field: "model_type" });
    if (req.url === "/api/models/gone") return reply(404, { error: "Model not found" });
    if (req.url === "/api/training/start") return reply(409, { error: "Already training" });
    if (req.url === "/api/broken") return reply(500, { error: "Traceback: secret internals" });
    reply(404, { error: "not found" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(() => {
  server.close();
});

function request(ownerId: number, path: string, more: Partial<MlRequest> = {}): MlRequest {
  return { base, method: "GET", path, query: "", ownerId, secret: SECRET, ...more };
}

async function json(req: MlRequest): Promise<{ status: number; body: unknown }> {
  const answer = await forwardToMl(req);
  return { status: answer.status, body: await new Response(answer.body).json() };
}

function upload(ownerId: number, name: string): MlRequest {
  const form = new FormData();
  form.append("name", name);
  form.append("file", new Blob(["text,label\nhello,a\n"], { type: "text/csv" }), "data.csv");
  const encoded = new Request("http://x", { method: "POST", body: form });
  return request(ownerId, "/api/datasets/upload", {
    method: "POST",
    contentType: encoded.headers.get("content-type") ?? undefined,
    body: encoded.body,
  });
}

describe("the ML service token", () => {
  it("names the person as a string subject and lives at most 60 seconds", () => {
    const claims = verify(signMlToken(7, SECRET, 1_000));
    expect(claims.sub).toBe("7");
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(ML_TOKEN_LIFETIME_SECONDS);
  });
});

describe("forwarding to the ML service", () => {
  // Isolation is the service's, by token subject. What the platform must get
  // right is signing each request for whoever made it.
  it("keeps two students' datasets apart", async () => {
    expect((await json(upload(1, "first student's"))).status).toBe(201);
    expect((await json(upload(2, "second student's"))).status).toBe(201);

    expect((await json(request(1, "/api/datasets/"))).body).toEqual({ datasets: ["first student's"] });
    expect((await json(request(2, "/api/datasets/"))).body).toEqual({ datasets: ["second student's"] });
  });

  it("passes the service's own refusals through with their status and body", async () => {
    expect(await json(request(1, "/api/models/"))).toEqual({
      status: 400,
      body: { error: "Pick a model type.", field: "model_type" },
    });
    expect((await json(request(1, "/api/models/gone"))).status).toBe(404);
    expect((await json(request(1, "/api/training/start"))).status).toBe(409);
  });

  it("words a failing service itself, without its internals", async () => {
    const failure = await forwardToMl(request(1, "/api/broken")).catch((e) => e);
    expect(failure).toBeInstanceOf(MlFailure);
    expect(failure.status).toBe(502);
    expect(failure.message).not.toContain("Traceback");
  });

  it("says the service is not running when nothing answers", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const address = closed.address();
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const port = typeof address === "object" && address ? address.port : 0;

    const failure = await forwardToMl({ ...request(1, "/api/datasets/"), base: `http://127.0.0.1:${port}` }).catch(
      (e) => e,
    );
    expect(failure).toBeInstanceOf(MlFailure);
    expect(failure.status).toBe(503);
    expect(failure.message).toBe(ML_NOT_RUNNING);
    expect(ML_NOT_RUNNING).toMatch(/^The ML service is not running/);
  });
});

describe("the ML routes", () => {
  const routes = join(__dirname, "../server/api/services/ml");

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path.slice(routes.length + 1)];
    });
  }

  // A catch-all here would let the page call any route of the service as the
  // student, including ones nobody meant to offer.
  it("name each operation, with no catch-all", () => {
    const all = files(routes);
    expect(all.some((f) => f.includes("[..."))).toBe(false);
    expect(all.sort()).toEqual([
      "datasets/[id].delete.ts",
      "datasets/[id].get.ts",
      "datasets/from-documents.post.ts",
      "datasets/index.get.ts",
      "datasets/task-types.get.ts",
      "documents.get.ts",
      "models/[id]/index.delete.ts",
      "models/[id]/index.get.ts",
      "models/[id]/predict.post.ts",
      "models/available.get.ts",
      "models/index.get.ts",
      "models/index.post.ts",
      "training/[jobId]/metrics.get.ts",
      "training/start.post.ts",
      "training/status/[jobId].get.ts",
    ]);
  });
});

describe("the signing secret", () => {
  it("is made once and then kept", () => {
    const dir = mkdtempSync(join(tmpdir(), "legal-blocks-ml-"));
    try {
      const path = join(dir, "volume", "secret");
      const first = mlSecret(path);
      expect(existsSync(path)).toBe(true);
      expect(first).toMatch(/^[0-9a-f]{64}$/);
      expect(mlSecret(path)).toBe(first);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { documentsToCsv } from "../server/ml/table";

describe("a Documents dataset as a training table", () => {
  it("has the text first, then the columns it was imported with", () => {
    const { csv, columns } = documentsToCsv([
      { name: "r1", full_text: 'The tenant "shall" pay, monthly', metadata: { fields: { label: "obligation" } } },
      { name: "r2", full_text: "The buyer may inspect", metadata: { fields: { label: "permission", note: "x" } } },
      { name: "memo", full_text: "Plain", metadata: null },
    ]);
    expect(columns).toEqual(["text", "label", "note"]);
    expect(csv).toBe(
      'text,label,note\n"The tenant ""shall"" pay, monthly",obligation,\nThe buyer may inspect,permission,x\nPlain,,\n',
    );
  });
});

import { findTrainingSet, trainingSetTag } from "../server/ml/training-set";

describe("sending the same documents to train on twice", () => {
  const csv = "text,label\nThe tenant shall pay,obligation\n";

  it("finds the copy the service already has, for the same task", () => {
    const tag = trainingSetTag(3, csv);
    const sent = [
      { id: 1, description: "", task_type: "text_classification" },
      { id: 2, description: tag, task_type: "text_classification" },
    ];
    expect(findTrainingSet(sent, tag, "text_classification")?.id).toBe(2);
    expect(findTrainingSet(sent, tag, "topic_modeling")).toBeUndefined();
  });

  it("tells a re-import with other rows, or other documents, apart", () => {
    const tag = trainingSetTag(3, csv);
    expect(trainingSetTag(3, csv + "The buyer may inspect,permission\n")).not.toBe(tag);
    expect(trainingSetTag(4, csv)).not.toBe(tag);
  });
});
