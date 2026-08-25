import { tasks } from "@legal-blocks/db";

export default defineEventHandler((event) => tasks(requireDb(event)));
