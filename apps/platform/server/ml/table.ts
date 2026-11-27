// A Documents dataset as the table the ML service trains on.
//
// One row per document: its text, then the columns it was imported with (a
// label, a summary), in the order they first appear. A document imported from
// a file rather than a table has only its text, which is enough for topic
// modelling and clustering; a classification needs its label column.

import type { DocumentRow } from "@legal-blocks/db";

function cell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function documentsToCsv(rows: DocumentRow[]): { csv: string; columns: string[] } {
  const extra: string[] = [];
  for (const row of rows) {
    const fields = (row.metadata?.["fields"] ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(fields)) {
      if (key.toLowerCase() !== "text" && !extra.includes(key)) extra.push(key);
    }
  }
  const columns = ["text", ...extra];
  const lines = [columns.map(cell).join(",")];
  for (const row of rows) {
    const fields = (row.metadata?.["fields"] ?? {}) as Record<string, unknown>;
    lines.push([row.full_text, ...extra.map((k) => fields[k])].map(cell).join(","));
  }
  return { csv: lines.join("\n") + "\n", columns };
}
