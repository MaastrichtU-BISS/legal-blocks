import { annotations } from "@legal-blocks/db";

/** The filtered annotation list. Filtering happens in SQL, not the browser. */
export default defineEventHandler((event) => {
  const q = getQuery(event);
  const split = (v: unknown): string[] =>
    typeof v === "string" && v !== "" ? v.split(",").filter(Boolean) : [];

  return annotations(requireDb(event), idParam(event, "id"), {
    labels: split(q["labels"]),
    documents: split(q["documents"]),
    annotators: split(q["annotators"]),
  });
});
