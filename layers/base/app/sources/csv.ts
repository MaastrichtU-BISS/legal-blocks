// Reading a CSV into rows, for importing a table as documents: one document
// per row, its text from the `text` column and the other columns kept with it.
//
// Written here rather than pulled in: quoted fields, doubled quotes, line
// breaks inside quotes and the three separators people actually export with
// are the whole job.

export interface CsvTable {
  columns: string[];
  rows: Record<string, string>[];
}

const SEPARATORS = [",", ";", "\t"];

/** The separator the header line uses most, outside quotes. */
function separatorOf(text: string): string {
  let inQuotes = false;
  const counts = new Map<string, number>();
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && SEPARATORS.includes(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best = ",";
  for (const sep of SEPARATORS) if ((counts.get(sep) ?? 0) > (counts.get(best) ?? 0)) best = sep;
  return best;
}

function records(text: string, sep: string): string[][] {
  const out: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      out.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length) {
    record.push(field);
    out.push(record);
  }
  return out.filter((r) => r.some((f) => f.trim() !== ""));
}

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^﻿/, "");
  const [header, ...body] = records(text, separatorOf(text));
  const columns = (header ?? []).map((c) => c.trim());
  const rows = body.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ""])));
  return { columns, rows };
}

/** The column a row's document text comes from: `text`, in any case. */
export function textColumn(columns: string[]): string | undefined {
  return columns.find((c) => c.toLowerCase() === "text");
}
