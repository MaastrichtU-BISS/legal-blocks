// Who is asking, and whether they may.

import type { H3Event } from "h3";
import { user, type Account } from "@legal-blocks/db";

/**
 * The person making this request: whoever is signed in, put on the event by
 * server/middleware/auth.ts, or the platform's own account when nobody signs in.
 */
export function currentUser(event: H3Event): Account {
  if (event.context.user) return event.context.user;
  const db = requireDb(event);
  return user(db, owner(db))!;
}

/** Whoever created the platform. They see everything. */
export function isAdmin(me: Account): boolean {
  return me.role === "admin";
}

export function requireAdmin(event: H3Event): Account {
  const me = currentUser(event);
  if (!isAdmin(me)) throw fail(event, 403, "only whoever created this platform can see this");
  return me;
}

/** A new password, or a 400 when it is too short to be worth having. */
export function readNewPassword(event: H3Event, value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8) throw fail(event, 400, "a password needs at least 8 characters");
  return password;
}
