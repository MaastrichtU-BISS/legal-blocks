import { defaultImporter } from "node-legal-docs-import";

/** What this build can parse, for the file picker's accept list. */
export default defineEventHandler(() => ({ extensions: defaultImporter().extensions() }));
