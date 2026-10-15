// Who is asking, and whether they may.

import type { H3Event } from "h3";
import { user, type Account } from "@legal-blocks/db";
import { roleAtLeast } from "@legal-blocks/manifest";

/**
 * The person making this request: whoever is signed in, put on the event by
 * server/middleware/auth.ts, or the platform's own account when nobody signs in.
 */
export function currentUser(event: H3Event): Account {
  if (event.context.user) return event.context.user;
  const db = requireDb(event);
  return user(db, owner(db))!;
}

/** The current user, or a 403 when their role is below `minimum`. */
export function requireRole(event: H3Event, minimum: "annotator" | "editor" | "admin"): Account {
  const me = currentUser(event);
  if (!roleAtLeast(me.role, minimum)) {
    throw fail(event, 403, `you need ${minimum} rights for this — ask an admin`);
  }
  return me;
}

/** A new password, or a 400 when it is too short to be worth having. */
export function readNewPassword(event: H3Event, value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8) throw fail(event, 400, "a password needs at least 8 characters");
  return password;
}

/** A role from a request body, or a 400 when it is not one of the three. */
export function readRole(event: H3Event, value: unknown): string {
  if (value === "annotator" || value === "editor" || value === "admin") return value;
  throw fail(event, 400, `role must be annotator, editor or admin`);
}
