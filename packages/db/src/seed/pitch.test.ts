import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { KANJIUM_SOURCE, parseAccentField, parseKanjiumAccents } from "./pitch";

const FIXTURE = fileURLToPath(new URL("../../seeds/fixtures/kanjium-accents-sample.txt", import.meta.url));

describe("parseAccentField", () => {
  it("plain single and multiple downsteps", () => {
    expect(parseAccentField("2")).toEqual([2]);
    expect(parseAccentField("0,2")).toEqual([0, 2]);
  });
  it("drops POS hints, keeps every distinct position in order", () => {
    expect(parseAccentField("(副)0,(名)3")).toEqual([0, 3]);
    expect(parseAccentField("(副)1,0,(形動)0")).toEqual([1, 0]);
    expect(parseAccentField("(形動)0,(副;名)1")).toEqual([0, 1]);
  });
  it("ignores garbage parts", () => {
    expect(parseAccentField("x,,3")).toEqual([3]);
    expect(parseAccentField("")).toEqual([]);
  });
});

describe("parseKanjiumAccents", () => {
  it("kana-only words take the expression as reading", () => {
    const [row] = parseKanjiumAccents("コーヒー\t\t3\n");
    expect(row).toEqual({ language: "ja", lemma: "コーヒー", reading: "コーヒー", positions: [3], source: KANJIUM_SOURCE });
  });
  it("merges repeated (lemma, reading) lines and skips malformed ones", () => {
    const rows = parseKanjiumAccents("橋\tはし\t2\n橋\tはし\t2,0\nbad line\n端\tはし\t\n\n");
    expect(rows).toEqual([{ language: "ja", lemma: "橋", reading: "はし", positions: [2, 0], source: KANJIUM_SOURCE }]);
  });
  it("tolerates CRLF", () => {
    expect(parseKanjiumAccents("箸\tはし\t1\r\n")[0]!.positions).toEqual([1]);
  });
  it("parses the committed fixture (one row per line, homographs kept apart)", () => {
    const rows = parseKanjiumAccents(readFileSync(FIXTURE, "utf8"));
    expect(rows).toHaveLength(15);
    const get = (l: string, r: string) => rows.find((x) => x.lemma === l && x.reading === r)?.positions;
    expect(get("箸", "はし")).toEqual([1]);
    expect(get("橋", "はし")).toEqual([2]);
    expect(get("端", "はし")).toEqual([0]);
    expect(get("日本", "にほん")).toEqual([2]);
    expect(get("２つ", "ふたつ")).toEqual([0, 3]);
  });
});
