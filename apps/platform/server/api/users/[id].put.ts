import { setPassword, setRole, user } from "@legal-blocks/db";

/**
 * Changes somebody's role or password. An admin may change anybody's; anybody
 * may change their own password. Nobody changes their own role, so the last
 * admin cannot lock everybody out.
 */
export default defineEventHandler(async (event) => {
  const id = idParam(event, "id");
  const me = currentUser(event);
  const self = me.id === id;
  if (!self) requireRole(event, "admin");

  const db = useAccountsDb(event);
  if (!user(db, id)) throw fail(event, 404, `no user ${id}`);

  const body = await readBody<{ role?: string; password?: string }>(event);
  if (body.role !== undefined) {
    if (self) throw fail(event, 400, "you cannot change your own role");
    setRole(db, id, readRole(event, body.role));
  }
  if (body.password !== undefined) {
    setPassword(db, id, await hashPassword(readNewPassword(event, body.password)));
  }
  return user(db, id);
});
