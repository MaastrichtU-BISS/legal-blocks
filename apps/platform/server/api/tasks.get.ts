import { tasks } from "@legal-blocks/db";
import { roleAtLeast } from "@legal-blocks/manifest";

/** Every task for an editor; for an annotator, the ones they have work in. */
export default defineEventHandler((event) => {
  const me = currentUser(event);
  const all = tasks(requireDb(event));
  if (roleAtLeast(me.role, "editor")) return all;
  return all.filter((t) => t.annotators.some((a) => a.id === me.id));
});
