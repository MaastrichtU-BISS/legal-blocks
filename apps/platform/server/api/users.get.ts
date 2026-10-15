import { users } from "@legal-blocks/db";

// The people in this platform, for the "Working as" selector when nobody signs
// in. Everyone's address, so only the admin may list them.
export default defineEventHandler((event) => {
  requireAdmin(event);
  return users(useAccountsDb(event));
});
