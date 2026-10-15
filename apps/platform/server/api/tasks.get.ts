import { tasks } from "@legal-blocks/db";

/** The tasks this person made or has work in. */
export default defineEventHandler((event) => {
  const me = currentUser(event);
  const all = tasks(requireDb(event));
  return all.filter((t) => t.user_id === me.id || t.annotators.some((a) => a.id === me.id));
});
