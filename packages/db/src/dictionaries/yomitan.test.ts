import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { buildYomitanFixture } from "./fixture";
import {
  YomitanImportError,
  inspectYomitanZip,
  parseDefinition,
  parseIndex,
  parseTermBank,
  parseTermMetaBank,
  pitchPositionToDownstep,
} from "./yomitan";
import { isSafeHref, sanitizeStructuredContent, scToText } from "./structured-content";

function bank(zip: Uint8Array, name: string): unknown {
  return JSON.parse(new TextDecoder().decode(unzipSync(zip)[name]!));
}

describe("parseIndex", () => {
  it("reads the v3 index and defaults the language to ja", () => {
    const idx = parseIndex({ title: "T", revision: "1", format: 3, author: "A", frequencyMode: "rank-based" });
    expect(idx).toMatchObject({ title: "T", revision: "1", format: 3, author: "A", sourceLanguage: "ja", frequencyMode: "rank-based" });
  });
  it("accepts `version` as the format alias", () => {
    expect(parseIndex({ title: "T", revision: "1", version: 3 }).format).toBe(3);
  });
  it("rejects old formats, missing fields and reserved titles", () => {
    expect(() => parseIndex({ title: "T", revision: "1", format: 1 })).toThrow(/format 1 is not supported/);
    expect(() => parseIndex({ title: "T", revision: "1" })).toThrow(YomitanImportError);
    expect(() => parseIndex({ revision: "1", format: 3 })).toThrow(/title/);
    expect(() => parseIndex({ title: "Kanjium", revision: "1", format: 3 })).toThrow(/reserved/);
    expect(() => parseIndex([])).toThrow(YomitanImportError);
  });
});

describe("inspectYomitanZip", () => {
  it("lists only root-level banks, ignoring images and CSS", () => {
    const l = inspectYomitanZip(buildYomitanFixture({ title: "Mono", kind: "terms" }));
    expect(l.index.title).toBe("Mono");
    expect(l.termBanks).toEqual(["term_bank_1.json"]);
    expect(l.tagBanks).toEqual(["tag_bank_1.json"]);
    expect(l.metaBanks).toEqual([]);
  });
  it("orders banks numerically", () => {
    const zip = buildYomitanFixture({ title: "M", kind: "terms", extraTerms: [], files: { "term_bank_10.json": strToU8("[]") } });
    expect(inspectYomitanZip(zip).termBanks).toEqual(["term_bank_1.json", "term_bank_2.json", "term_bank_10.json"]);
  });
  it("rejects zip-slip paths", () => {
    for (const evil of ["../evil.json", "a/../../b", "/etc/passwd", "C:/x", "a\\b"]) {
      const zip = buildYomitanFixture({ title: "M", kind: "freq", files: { [evil]: strToU8("x") } });
      expect(() => inspectYomitanZip(zip), evil).toThrow(/unsafe path/);
    }
  });
  it("rejects archives over the uncompressed limit", () => {
    const big = zipSync({
      "index.json": strToU8(JSON.stringify({ title: "B", revision: "1", format: 3 })),
      "term_bank_1.json": new Uint8Array(2 * 1024 * 1024), // compresses to almost nothing
    });
    expect(() => inspectYomitanZip(big, { maxUncompressedBytes: 1024 * 1024 })).toThrow(/over the 1 MB limit/);
  });
  it("rejects non-zips and archives without index.json", () => {
    expect(() => inspectYomitanZip(strToU8("not a zip"))).toThrow(/zip/);
    expect(() => inspectYomitanZip(zipSync({ "term_bank_1.json": strToU8("[]") }))).toThrow(/index\.json not found/);
    expect(() => inspectYomitanZip(zipSync({ "dir/index.json": strToU8("{}") }))).toThrow(/index\.json not found/);
  });
  it("rejects invalid JSON in index.json", () => {
    expect(() => inspectYomitanZip(zipSync({ "index.json": strToU8("{nope") }))).toThrow(/invalid JSON/);
  });
});

describe("parseTermBank", () => {
  const zip = buildYomitanFixture({ title: "Mono", kind: "terms" });
  const { rows, skipped } = parseTermBank(bank(zip, "term_bank_1.json"));

  it("parses rows, resolves empty readings and counts malformed ones", () => {
    expect(rows.map((r) => [r.expression, r.reading])).toEqual([["猫", "ねこ"], ["食べる", "たべる"], ["する", "する"]]);
    expect(skipped).toBe(1);
    expect(rows[1]).toMatchObject({ tags: ["動", "common"], score: 5, sequence: 2 });
  });
  it("keeps structured content as sanitized JSON", () => {
    const def = rows[0]!.definitions[0]!;
    expect(def.type).toBe("sc");
    const json = JSON.stringify(def);
    expect(json).not.toContain("img");
    expect(json).not.toContain("javascript");
    expect(json).not.toContain("color");
    expect(json).not.toContain("data");
    expect(json).toContain("https://example.com/neko");
    expect(scToText(def.type === "sc" ? def.content : null)).toContain("家で飼われる小さな獣(けもの)。");
  });
  it("drops image definitions and keeps plain strings as text", () => {
    expect(rows[2]!.definitions).toEqual([{ type: "text", text: "行う。" }]);
    expect(rows[1]!.definitions).toEqual([{ type: "text", text: "食物を口に入れる。" }, { type: "text", text: "生活する。" }]);
  });
  it("turns deinflection glossary items into a pointer", () => {
    expect(parseDefinition(["食べる", ["past"]])).toEqual({ type: "text", text: "→ 食べる" });
  });
  it("rejects a bank that is not an array", () => {
    expect(() => parseTermBank({})).toThrow(YomitanImportError);
  });
});

describe("parseTermMetaBank", () => {
  it("reads every frequency shape and ignores ipa", () => {
    const zip = buildYomitanFixture({ title: "F", kind: "freq" });
    const { freq, pitch, skipped } = parseTermMetaBank(bank(zip, "term_meta_bank_1.json"));
    expect(pitch).toEqual([]);
    expect(skipped).toBe(0);
    expect(freq).toEqual([
      { expression: "猫", reading: "ねこ", value: 120, displayValue: "120" },
      { expression: "食べる", reading: "たべる", value: 40, displayValue: null },
      { expression: "食べる", reading: "たべる", value: 900, displayValue: "900㋕" },
      { expression: "する", reading: "", value: 7, displayValue: null },
    ]);
  });
  it("parses numeric strings and skips junk", () => {
    const { freq, skipped } = parseTermMetaBank([["a", "freq", "1234㋕"], ["b", "freq", "n/a"], ["c", "what", 1], [1, "freq", 2]]);
    expect(freq).toEqual([{ expression: "a", reading: "", value: 1234, displayValue: "1234㋕" }]);
    expect(skipped).toBe(3);
  });
  it("reads pitch positions (integers and HL strings), deduplicated", () => {
    const zip = buildYomitanFixture({ title: "P", kind: "pitch" });
    const { pitch } = parseTermMetaBank(bank(zip, "term_meta_bank_1.json"));
    expect(pitch).toEqual([
      { expression: "猫", reading: "ねこ", positions: [1, 0] },
      { expression: "食べる", reading: "たべる", positions: [2] },
    ]);
  });
});

describe("pitchPositionToDownstep", () => {
  it.each([
    [0, 0], [3, 3], ["HLL", 1], ["LHHL", 3], ["LHH", 0], ["LHLL", 2], ["H", 0],
  ])("%s → %s", (input, out) => expect(pitchPositionToDownstep(input)).toBe(out));
  it("rejects junk", () => {
    expect(pitchPositionToDownstep("HXL")).toBeNull();
    expect(pitchPositionToDownstep(-1)).toBeNull();
    expect(pitchPositionToDownstep(1.5)).toBeNull();
  });
});

describe("sanitizeStructuredContent", () => {
  it("keeps whitelisted tags and the small style allowlist", () => {
    expect(
      sanitizeStructuredContent({
        tag: "span",
        style: { fontWeight: "bold", fontStyle: "italic", color: "red", fontSize: "999px", textDecorationLine: ["underline"] },
        lang: "ja",
        content: "x",
      }),
    ).toEqual({ tag: "span", lang: "ja", content: "x", style: { fontWeight: "bold", fontStyle: "italic", textDecorationLine: "underline" } });
  });
  it("unwraps unknown tags and drops images/scripts", () => {
    expect(sanitizeStructuredContent({ tag: "marquee", content: "hi" })).toBe("hi");
    expect(sanitizeStructuredContent([{ tag: "img", path: "a.png" }, "t", { tag: "script", content: "alert(1)" }])).toBe("t");
  });
  it("only keeps http(s) links; other links become spans", () => {
    expect(sanitizeStructuredContent({ tag: "a", href: "https://x.test/", content: "a" })).toEqual({ tag: "a", href: "https://x.test/", content: "a" });
    expect(sanitizeStructuredContent({ tag: "a", href: "javascript:alert(1)", content: "a" })).toEqual({ tag: "span", content: "a" });
    expect(sanitizeStructuredContent({ tag: "a", href: "?query=猫", content: "a" })).toEqual({ tag: "span", content: "a" });
    expect(isSafeHref("data:text/html,x")).toBe(false);
  });
  it("bounds table spans and depth", () => {
    expect(sanitizeStructuredContent({ tag: "td", colSpan: 9999, rowSpan: 2, content: "c" })).toEqual({ tag: "td", rowSpan: 2, content: "c" });
    let deep: unknown = "x";
    for (let i = 0; i < 100; i++) deep = { tag: "div", content: deep };
    expect(JSON.stringify(sanitizeStructuredContent(deep))).not.toContain("\"x\"");
  });
});
