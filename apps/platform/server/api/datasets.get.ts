import { datasets } from "@legal-blocks/db";

/** Everything for the admin; otherwise what this person made. */
export default defineEventHandler((event) => {
  const me = currentUser(event);
  const all = datasets(requireDb(event));
  return isAdmin(me) ? all : all.filter((r) => r.user_id === me.id);
});
