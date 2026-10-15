import { anyoneCanSignIn, setPassword, setRole, user, usersByEmail } from "@legal-blocks/db";

/**
 * Makes the first admin. Only possible while nobody can sign in, so it closes
 * itself the moment it has been used.
 */
export default defineEventHandler(async (event) => {
  const db = useAccountsDb(event);
  if (anyoneCanSignIn(db)) throw fail(event, 409, "this platform already has an admin");

  const body = await readBody<{ email?: string; password?: string }>(event);
  const password = readNewPassword(event, body.password);
  const [admin] = usersByEmail(db, [String(body.email ?? "")]);
  if (!admin) throw fail(event, 400, "an email address is required");

  setRole(db, admin.id, "admin");
  setPassword(db, admin.id, await hashPassword(password));
  await setUserSession(event, { user: { id: admin.id } }, sessionCookie(event));
  return user(db, admin.id);
});
