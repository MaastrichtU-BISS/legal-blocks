// Importing a table: a CSV becomes one document per row.
//
// The import component reads one file into one document, so this works in
// two halves. The reader checks the file is a table it can use and keeps its
// rows; the preparation step, which runs over everything read, replaces that
// one document with a document per row. The text comes from the `text`
// column, and the other columns (a label, a summary) travel with each row as
// metadata, which is what training reads.

import { parseCsv, textColumn } from "./csv";

export interface ImportedDocument {
  name: string;
  source: string;
  full_text: string;
  metadata?: Record<string, unknown>;
}

const ROWS = "tableRows";

export const csvReader = {
  extensions: [".csv"],
  label: "CSV (one document per row, from its text column)",
  async read(file: File): Promise<{ text: string; metadata: Record<string, unknown> }> {
    const table = parseCsv(await file.text());
    const column = textColumn(table.columns);
    if (!column) {
      throw new Error(
        `this table has no column named "text", which is where each row's document comes from (it has ${table.columns.join(", ") || "no columns"})`,
      );
    }
    const rows = table.rows.filter((r) => (r[column] ?? "").trim() !== "");
    if (!rows.length) throw new Error("this table has no rows with text");
    return {
      text: `${rows.length} rows`,
      metadata: { [ROWS]: rows.map((r) => ({ text: r[column]!, fields: withoutColumn(r, column) })) },
    };
  },
};

function withoutColumn(row: Record<string, string>, column: string): Record<string, string> {
  const { [column]: _text, ...rest } = row;
  return rest;
}

/** Replaces each table read by csvReader with one document per row. */
export async function expandTables(documents: ImportedDocument[]): Promise<ImportedDocument[]> {
  return documents.flatMap((doc) => {
    const rows = doc.metadata?.[ROWS] as { text: string; fields: Record<string, string> }[] | undefined;
    if (!rows) return [doc];
    const width = String(rows.length).length;
    return rows.map((row, i) => ({
      name: `${doc.name} row ${String(i + 1).padStart(width, "0")}`,
      source: doc.source,
      full_text: row.text,
      metadata: { fields: row.fields },
    }));
  });
}
