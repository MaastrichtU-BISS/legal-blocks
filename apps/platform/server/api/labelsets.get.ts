import { labelsets } from "@legal-blocks/db";

/** What this person made. */
export default defineEventHandler((event) => {
  const me = currentUser(event);
  const all = labelsets(requireDb(event));
  return all.filter((r) => r.user_id === me.id);
});
