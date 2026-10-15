import { users } from "@legal-blocks/db";

// The people who can work in this platform: the "Working as" selector when
// nobody signs in, the admin's user list when they do.
export default defineEventHandler((event) => {
  requireRole(event, "editor");
  return users(useAccountsDb(event));
});
