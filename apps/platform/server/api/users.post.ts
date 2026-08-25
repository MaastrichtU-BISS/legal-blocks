import { users } from "@legal-blocks/db";

// Annotators arrive by email now, when a task is created — counting them into
// existence produced people with no way to be identified, which is exactly
// what stopped anyone being invited to a task.
//
// The route stays because the frontend still calls it on startup, and
// answering with the current list is the honest response to "make sure there
// are N of them".
export default defineEventHandler((event) => users(requireDb(event)));
