import { setPassword, setRole, user, usersByEmail } from "@legal-blocks/db";

/** Adds somebody who can sign in. Admins only. */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const db = useAccountsDb(event);

  const body = await readBody<{ email?: string; role?: string; password?: string }>(event);
  const password = readNewPassword(event, body.password);
  const [person] = usersByEmail(db, [String(body.email ?? "")]);
  if (!person) throw fail(event, 400, "an email address is required");

  setRole(db, person.id, readRole(event, body.role ?? "annotator"));
  setPassword(db, person.id, await hashPassword(password));
  return user(db, person.id);
});
