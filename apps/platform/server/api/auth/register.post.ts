import { anyoneCanSignIn, setPassword, setRole, user, usersByEmail } from "@legal-blocks/db";

/**
 * Creates an account. Anybody may. The first one made on a platform is its
 * admin. Somebody already named on a task has a row waiting, and creating the
 * account with that address makes it theirs.
 */
export default defineEventHandler(async (event) => {
  const db = useAccountsDb(event);
  const body = await readBody<{ email?: string; password?: string }>(event);
  const password = readNewPassword(event, body.password);
  const first = !anyoneCanSignIn(db);

  const [person] = usersByEmail(db, [String(body.email ?? "")]);
  if (!person) throw fail(event, 400, "an email address is required");
  if (person.can_sign_in) {
    throw fail(event, 409, "there is already an account with this email — sign in instead");
  }

  setPassword(db, person.id, await hashPassword(password));
  if (first) setRole(db, person.id, "admin");
  await setUserSession(event, { user: { id: person.id } }, sessionCookie(event));
  return user(db, person.id);
});
