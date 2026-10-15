import { passwordFor, user } from "@legal-blocks/db";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event);
  const db = useAccountsDb(event);

  const found = passwordFor(db, String(body.email ?? ""));
  if (!found || !(await verifyPassword(found.hash, String(body.password ?? "")))) {
    throw fail(event, 401, "wrong email or password");
  }

  await setUserSession(event, { user: { id: found.id } }, sessionCookie(event));
  return user(db, found.id);
});
