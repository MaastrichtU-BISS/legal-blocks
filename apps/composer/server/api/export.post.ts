import { buildExport, exportFilename } from "@legal-blocks/export";
import { parsePipeline } from "@legal-blocks/manifest";
import { registry } from "../../../../layers/base/server-registry";

/**
 * Validates a draft and builds the platform zip.
 *
 * Parsing is the validation: parsePipeline rejects anything the composer
 * should not have allowed, and its message is the one the user sees. There is
 * no separate validate endpoint, because a second copy of that rule is a
 * second thing that can disagree with this one.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  let pipeline;
  try {
    pipeline = parsePipeline(body, registry);
  } catch (e) {
    throw createError({
      statusCode: 400,
      statusMessage: e instanceof Error ? e.message : String(e),
    });
  }

  const zip = buildExport({ pipeline, registry, ...images() });

  setResponseHeader(event, "content-type", "application/zip");
  setResponseHeader(
    event,
    "content-disposition",
    `attachment; filename="${exportFilename(pipeline.name)}"`,
  );
  return zip;
});
