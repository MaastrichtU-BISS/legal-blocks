import type { Handle } from "./db.js";
import { transaction } from "./db.js";
import type { Account, User } from "./model.js";

/** Everyone, in id order. */
export function users(db: Handle): Account[] {
  const rows = db
    .prepare(
      `SELECT id, name, COALESCE(email, '') AS email, role,
              password_hash IS NOT NULL AS can_sign_in
         FROM users ORDER BY id`,
    )
    .all() as (User & { can_sign_in: number })[];
  return rows.map((r) => ({ ...r, can_sign_in: r.can_sign_in === 1 }));
}

/** One person, or undefined when there is no such row. */
export function user(db: Handle, userId: number): Account | undefined {
  return users(db).find((u) => u.id === userId);
}

/**
 * Changes what somebody is allowed to do.
 *
 * Separate from usersByEmail because the two answer different questions. That
 * one turns an address into a row and has no opinion about the person; this
 * says what the row is for. Only the platform's creator becomes an admin;
 * every other row stays a member.
 */
export function setRole(db: Handle, userId: number, role: string): void {
  db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, userId);
}

/**
 * Resolves each address to a user, creating one for any it has not seen, and
 * returns them in the order given.
 *
 * This is how annotators join a platform. Whoever sets up a task types the
 * addresses of the people who should do it, and those people have almost
 * certainly never opened it — so a row is created for them and the assignment
 * has something to point at. Nobody is notified, which is the honest gap:
 * somebody has to tell them the platform exists. When they do arrive and sign
 * in with that address they become this row rather than a second one, which is
 * the whole reason the address is what identifies them.
 *
 * Addresses are matched case-insensitively and stored lowercased. Anna typing
 * her own address in one case and her colleague typing it in another must not
 * produce two annotators with half the work each.
 */
export function usersByEmail(db: Handle, emails: string[]): Account[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (email === "" || seen.has(email)) continue;
    seen.add(email);
    cleaned.push(email);
  }
  if (cleaned.length === 0) return [];

  transaction(db, () => {
    const insert = db.prepare(
      `INSERT INTO users (name, email) VALUES (?, ?)
       ON CONFLICT (email) DO NOTHING`,
    );
    for (const email of cleaned) {
      // The name is a placeholder until they introduce themselves. The local
      // part is a better guess than "Annotator 3" and is what a reviewer will
      // recognise in a metrics report.
      const at = email.indexOf("@");
      insert.run(at > 0 ? email.slice(0, at) : email, email);
    }
  });

  const byEmail = new Map(users(db).map((u) => [u.email, u]));
  return cleaned.map((e) => byEmail.get(e)).filter((u): u is Account => u !== undefined);
}
