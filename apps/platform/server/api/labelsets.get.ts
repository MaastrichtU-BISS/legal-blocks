import { labelsets } from "@legal-blocks/db";

export default defineEventHandler((event) => labelsets(requireDb(event)));
