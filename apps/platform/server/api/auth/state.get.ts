import { anyoneCanSignIn, user } from "@legal-blocks/db";
import { requiresLogin } from "@legal-blocks/manifest";

/**
 * What the app should show before anything else: whether this platform asks
 * people to sign in, whether it still needs its first admin, and who is signed
 * in now.
 */
export default defineEventHandler(async (event) => {
  if (!requiresLogin(usePipeline())) return { login: false };

  const db = useAccountsDb(event);
  const { user: session } = await getUserSession(event);
  const me = session ? user(db, session.id) : undefined;
  return {
    login: true,
    needsSetup: !anyoneCanSignIn(db),
    user: me?.can_sign_in ? me : null,
  };
});
