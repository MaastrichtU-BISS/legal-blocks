import { setPassword } from "@legal-blocks/db";

/** Changes the signed-in person's own password. */
export default defineEventHandler(async (event) => {
  const me = currentUser(event);
  const body = await readBody<{ password?: string }>(event);
  setPassword(useAccountsDb(event), me.id, await hashPassword(readNewPassword(event, body.password)));
  setResponseStatus(event, 204);
  return null;
});
