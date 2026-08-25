import { datasets } from "@legal-blocks/db";

export default defineEventHandler((event) => datasets(requireDb(event)));
