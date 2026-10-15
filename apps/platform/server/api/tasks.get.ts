import { tasks } from "@legal-blocks/db";

/** Every task for the admin; otherwise the ones this person made or has work in. */
export default defineEventHandler((event) => {
  const me = currentUser(event);
  const all = tasks(requireDb(event));
  if (isAdmin(me)) return all;
  return all.filter((t) => t.user_id === me.id || t.annotators.some((a) => a.id === me.id));
});
