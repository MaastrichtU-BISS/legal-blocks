import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { open, user, usersByEmail, type Handle } from "@legal-blocks/db";
import {
  OWNER_EMAIL,
  defaultAccountResolver,
  owner,
  type AccountResolver,
} from "../server/utils/platform";

let dir: string;
let db: Handle;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "legal-blocks-platform-"));
  db = open(join(dir, "platform.db"));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("owner() auth seam", () => {
  it("resolves and caches a single admin account by default", () => {
    const id = owner(db);
    expect(typeof id).toBe("number");

    const account = user(db, id);
    expect(account?.email).toBe(OWNER_EMAIL);
    expect(account?.role).toBe("admin");

    // Idempotent: a second call returns the same row and keeps admin.
    const again = owner(db);
    expect(again).toBe(id);
    expect(user(db, again)?.role).toBe("admin");
  });

  it("accepts an AccountResolver for a future login", () => {
    const resolver: AccountResolver = {
      resolve(database: Handle): number {
        const [account] = usersByEmail(database, ["custom@example.org"]);
        if (!account) throw new Error("missing custom account");
        return account.id;
      },
    };

    const id = owner(db, resolver);
    expect(user(db, id)?.email).toBe("custom@example.org");
  });

  it("accepts a role string", () => {
    const id = owner(db, "member");
    expect(user(db, id)?.email).toBe(OWNER_EMAIL);
    expect(user(db, id)?.role).toBe("member");
  });

  it("accepts an { email, role } object", () => {
    const id = owner(db, { email: "named@example.org", role: "member" });
    expect(user(db, id)?.email).toBe("named@example.org");
    expect(user(db, id)?.role).toBe("member");
  });

  it("exposes the default resolver", () => {
    const id = defaultAccountResolver.resolve(db);
    expect(user(db, id)?.email).toBe(OWNER_EMAIL);
    expect(user(db, id)?.role).toBe("admin");
  });
});
