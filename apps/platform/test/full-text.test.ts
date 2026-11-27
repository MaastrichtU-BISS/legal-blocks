import { describe, expect, it } from "vitest";
import { fetchFullTexts, isEchr } from "../server/legal-docs/full-text";

const client = {
  calls: [] as string[][],
  async getRechtspraakFullText(eclis: string | string[]) {
    const list = [eclis].flat();
    this.calls.push(list);
    return list.map((ecli) =>
      ecli.endsWith("404")
        ? { ecli, fullText: null, fullTextAvailable: false, message: "No full text published" }
        : { ecli, fullText: `Text of ${ecli}`, fullTextAvailable: true },
    );
  },
  async getEchrFullText(eclis: string | string[]) {
    const list = [eclis].flat();
    this.calls.push(list);
    return list.map((ecli) => ({ ecli, language: "ENG", fullText: `ECHR ${ecli}`, fullTextAvailable: true }));
  },
};

describe("fetching full text", () => {
  it("sends Dutch and ECHR judgments to their own sources and keeps the order", async () => {
    client.calls = [];
    const out = await fetchFullTexts(client, [
      { ecli: "ECLI:NL:HR:2020:1" },
      { ecli: "ECLI:CE:ECHR:2019:0101JUD000100" },
      { ecli: "ECLI:NL:RBAMS:2021:2", dataset: "RS" },
    ]);
    expect(out.map((d) => d.text)).toEqual([
      "Text of ECLI:NL:HR:2020:1",
      "ECHR ECLI:CE:ECHR:2019:0101JUD000100",
      "Text of ECLI:NL:RBAMS:2021:2",
    ]);
    expect(client.calls).toHaveLength(2);
  });

  it("says why a judgment has no text instead of inventing one", async () => {
    const [doc] = await fetchFullTexts(client, [{ ecli: "ECLI:NL:HR:2020:404" }]);
    expect(doc).toEqual({ ecli: "ECLI:NL:HR:2020:404", text: null, message: "No full text published" });
  });

  it("trusts the search's own dataset label for ECHR", () => {
    expect(isEchr({ ecli: "001-12345", dataset: "ECHR" })).toBe(true);
    expect(isEchr({ ecli: "ECLI:NL:HR:2020:1" })).toBe(false);
  });
});
