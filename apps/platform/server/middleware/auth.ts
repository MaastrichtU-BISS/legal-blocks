// When the pipeline asks for a login, every API route but signing in itself
// needs somebody signed in. Pages are not gated here: the app is a single page
// that asks /api/auth/state first and shows the sign-in form itself.

import { user } from "@legal-blocks/db";
import { requiresLogin } from "@legal-blocks/manifest";

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith("/api/")) return;
  if (!requiresLogin(usePipeline())) return;

  ensureSessionSecret();
  if (event.path.startsWith("/api/auth/")) return;

  const session = await requireUserSession(event, { message: "please sign in" });
  const me = user(useAccountsDb(event), session.user.id);

  // Deleted, or had their password taken away, since they signed in.
  if (!me?.can_sign_in) {
    await clearUserSession(event, sessionCookie(event));
    throw fail(event, 401, "please sign in again");
  }
  event.context.user = me;
});
