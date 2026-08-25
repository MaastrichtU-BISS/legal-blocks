import { defaultImporter } from "node-legal-docs-import";

/**
 * Parses uploaded files.
 *
 * The page collects files and shows what happened; this reads them. Both
 * halves of the answer come back together — documents and skipped files —
 * because failing the whole request over one corrupt file loses the others and
 * says nothing about which one was bad.
 */
export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event);
  if (!parts?.length) throw fail(event, 400, "no files were uploaded");

  const files = parts
    .filter((p) => p.filename)
    .map((p) => ({ name: p.filename!, data: new Uint8Array(p.data) }));
  if (files.length === 0) throw fail(event, 400, "no files were uploaded");

  return defaultImporter().import(files);
});
