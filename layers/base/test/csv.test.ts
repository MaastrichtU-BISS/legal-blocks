import { describe, expect, it } from "vitest";
import { parseCsv, textColumn } from "../app/sources/csv";

describe("reading a CSV", () => {
  it("reads quoted fields, doubled quotes and line breaks inside quotes", () => {
    const table = parseCsv('text,label\r\n"The tenant, who rents, ""shall"" pay",obligation\n"Two\nlines",permission\n');
    expect(table.columns).toEqual(["text", "label"]);
    expect(table.rows).toEqual([
      { text: 'The tenant, who rents, "shall" pay', label: "obligation" },
      { text: "Two\nlines", label: "permission" },
    ]);
  });

  it("takes the separator the header uses, as European exports use semicolons", () => {
    expect(parseCsv("﻿Text;label\nDe huurder moet betalen;obligation").rows).toEqual([
      { Text: "De huurder moet betalen", label: "obligation" },
    ]);
  });

  it("skips blank lines and finds the text column in any case", () => {
    const table = parseCsv("TEXT\tlabel\n\nshall\ta\n");
    expect(table.rows).toHaveLength(1);
    expect(textColumn(table.columns)).toBe("TEXT");
    expect(textColumn(["body", "label"])).toBeUndefined();
  });
});

import { csvReader, expandTables } from "../app/sources/table-import";

describe("importing a table", () => {
  const file = (content: string) => new File([content], "clauses.csv", { type: "text/csv" });

  it("makes one document per row, keeping the other columns", async () => {
    const read = await csvReader.read(file("text,label\nThe tenant shall pay,obligation\nThe buyer may inspect,permission\n"));
    const docs = await expandTables([
      { name: "clauses", source: "clauses.csv", full_text: read.text, metadata: read.metadata },
      { name: "memo", source: "memo.txt", full_text: "plain" },
    ]);
    expect(docs).toEqual([
      { name: "clauses row 1", source: "clauses.csv", full_text: "The tenant shall pay", metadata: { fields: { label: "obligation" } } },
      { name: "clauses row 2", source: "clauses.csv", full_text: "The buyer may inspect", metadata: { fields: { label: "permission" } } },
      { name: "memo", source: "memo.txt", full_text: "plain" },
    ]);
  });

  it("refuses a table with no text column, and says what it has", async () => {
    await expect(csvReader.read(file("body,label\nx,y\n"))).rejects.toThrow(/no column named "text".*body, label/);
  });
});
