import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BAD, GOOD } from "./__fixtures__/outputs";
import { checkLanguage, evaluateItem, findRomaji, surfaceOccursIn, type CheckName } from "./checks";
import { parseGoldSet, type GoldItem } from "./gold";

const gold = parseGoldSet(
  readFileSync(new URL("./gold/explain-ja-en.jsonl", import.meta.url), "utf8"),
);
const byId = (id: string): GoldItem => {
  const item = gold.items.find((i) => i.id === id);
  if (!item) throw new Error(`gold item ${id} missing`);
  return item;
};
const failed = (r: ReturnType<typeof evaluateItem>): CheckName[] =>
  r.checks.filter((c) => !c.pass).map((c) => c.name);

describe("gold set", () => {
  it("parses, is flagged unreviewed, and has ~30 items with unique ids", () => {
    expect(gold.meta?.status).toBe("unreviewed");
    expect(String(gold.meta?.note)).toMatch(/reviewed by a human/);
    expect(gold.items.length).toBeGreaterThanOrEqual(30);
    expect(new Set(gold.items.map((i) => i.id)).size).toBe(gold.items.length);
  });

  it("rejects malformed items", () => {
    expect(() => parseGoldSet('{"id":"x","topic":"t","line":"猫","expect":{"bogus":1}}')).toThrow(/unknown expect key/);
    expect(() => parseGoldSet('{"id":"x","topic":"t","line":"猫","expect":{"tagOf":{"犬":"noun"}}}')).toThrow(/does not occur/);
    expect(() => parseGoldSet('{"id":"x","topic":"t","line":"猫","expect":{}}\n{"id":"x","topic":"t","line":"猫","expect":{}}')).toThrow(/duplicate/);
    expect(() => parseGoldSet("not json")).toThrow(/line 1/);
  });
});

describe("good outputs pass every check", () => {
  for (const [id, raw] of Object.entries(GOOD)) {
    it(id, () => {
      const r = evaluateItem(byId(id), { raw });
      expect(failed(r)).toEqual([]);
      expect(r.pass).toBe(true);
    });
  }
});

describe("bad outputs are caught", () => {
  const item = byId("wa-ga-02");

  it("hallucinated particle, span outside the line, two accents", () => {
    const r = evaluateItem(item, { raw: BAD.hallucinated });
    expect(r.pass).toBe(false);
    expect(failed(r)).toEqual(expect.arrayContaining([
      "surfaces_in_line", "single_accent", "expect_not_contain",
    ]));
  });

  it("schema drift is measured as coercion loss", () => {
    const r = evaluateItem(item, { raw: BAD.schemaDrift });
    const loss = r.checks.find((c) => c.name === "no_coercion_loss");
    expect(loss?.pass).toBe(false);
    expect(loss?.detail).toMatch(/summary/);
    expect(loss?.detail).toMatch(/coerced to "expression"/);
    expect(loss?.detail).toMatch(/note missing/);
    expect(loss?.detail).toMatch(/reading/);
    expect(failed(r)).toContain("fields_non_empty");
  });

  it("romaji in prose", () => {
    const r = evaluateItem(item, { raw: BAD.romaji });
    expect(failed(r)).toContain("no_romaji");
  });

  it("plainTerms in the wrong language", () => {
    const r = evaluateItem(item, { raw: BAD.wrongLanguage });
    expect(failed(r)).toEqual(["plain_terms_language"]);
  });

  it("non-JSON response fails json_valid and stops", () => {
    const r = evaluateItem(item, { raw: BAD.prose });
    expect(r.checks).toEqual([{ name: "json_valid", pass: false, detail: expect.any(String) }]);
    expect(r.errored).toBe(false);
  });

  it("transport error is reported as errored, not as a quality failure", () => {
    const r = evaluateItem(item, { raw: null, error: "Provider error 500" });
    expect(r).toMatchObject({ errored: true, pass: false, error: "Provider error 500", checks: [] });
  });

  it("tagOf judges an exact part strictly but not a merged one", () => {
    const tags = byId("tags-01");
    const wrongVerb = JSON.parse(GOOD["tags-01"]!) as { breakdown: { surface: string; tag: string }[] };
    wrongVerb.breakdown[2]!.tag = "noun"; // 食べます as a noun
    const r = evaluateItem(tags, { raw: JSON.stringify(wrongVerb) });
    expect(r.checks.find((c) => c.name === "expect_tag_of")).toMatchObject({ pass: false, detail: expect.stringMatching(/食べ/) });
    // を merged into パンを (noun) in the good fixture: passes, with a note.
    const good = evaluateItem(tags, { raw: GOOD["tags-01"]! });
    expect(good.checks.find((c) => c.name === "expect_tag_of")).toMatchObject({ pass: true, detail: expect.stringMatching(/merged/) });
  });

  it("a noise line that gets a breakdown fails, and a real line with none fails", () => {
    expect(failed(evaluateItem(byId("noise-01"), { raw: GOOD["tags-01"]! }))).toContain("breakdown_shape");
    expect(failed(evaluateItem(item, { raw: GOOD["noise-01"]! }))).toContain("breakdown_shape");
  });
});

describe("helpers", () => {
  it("surfaceOccursIn tolerates spacing, 〜 markers and split patterns", () => {
    expect(surfaceOccursIn("歩いて います", "毎朝川沿いを歩いています。")).toBe(true);
    expect(surfaceOccursIn("〜ている", "窓が開いている。")).toBe(true);
    expect(surfaceOccursIn("ば〜ほど", "読めば読むほど面白い。")).toBe(true);
    expect(surfaceOccursIn("ほど〜ば", "読めば読むほど面白い。")).toBe(false);
    expect(surfaceOccursIn("がは", "象は鼻が長い。")).toBe(false);
  });

  it("findRomaji flags romaji but not plain English", () => {
    expect(findRomaji("The topic marker は (wa) sets the topic.")).not.toEqual([]);
    expect(findRomaji("He tabemasu every day")).toContain("tabemasu");
    expect(findRomaji("It's polite: desu at the end.")).toContain("desu");
    expect(findRomaji("A habit, made every morning; the subject is the trunk.")).toEqual([]);
    expect(findRomaji("We eat maiasa.", ["maiasa", "no"])).toEqual(["maiasa"]);
  });

  it("checkLanguage tells en from pt/es and from Japanese", () => {
    expect(checkLanguage("This is the topic of the sentence.", "en").pass).toBe(true);
    expect(checkLanguage("Isso é uma frase com o tópico, não uma pergunta.", "en").pass).toBe(false);
    expect(checkLanguage("これは文の主題です。", "en").pass).toBe(false);
    expect(checkLanguage("Isso é uma frase com o tópico, não uma pergunta.", "pt").pass).toBe(true);
  });
});
