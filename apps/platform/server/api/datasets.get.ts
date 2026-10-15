import { datasets } from "@legal-blocks/db";

/** What this person made. */
export default defineEventHandler((event) => {
  const me = currentUser(event);
  const all = datasets(requireDb(event));
  return all.filter((r) => r.user_id === me.id);
});
