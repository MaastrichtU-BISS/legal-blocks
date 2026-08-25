import { users } from "@legal-blocks/db";

// The people who can work in this platform. The runtime's "Working as"
// selector reads this; a login replaces it without anything downstream
// changing.
export default defineEventHandler((event) => users(requireDb(event)));
