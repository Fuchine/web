// A tiny hand-built Yomitan dictionary, zipped in memory with fflate (T3.4).
// Shared by the unit tests and the E2E suite; nothing is committed as a binary.
// Contents are invented for the test (no third-party dictionary text).

import { strToU8, zipSync, type Zippable } from "fflate";

export type FixtureKind = "terms" | "freq" | "pitch";

export function buildYomitanFixture(opts: {
  title: string;
  revision?: string;
  kind: FixtureKind;
  frequencyMode?: "rank-based" | "occurrence-based";
  /** index.json sourceLanguage (default "ja"); E2E uses "zxx" to stay apart from seeded data. */
  language?: string;
  /** index.json targetLanguage for a term dictionary (default = language → monolingual). */
  targetLanguage?: string;
  /** Extra term rows (term_bank_2.json). */
  extraTerms?: unknown[];
  /** Override files (e.g. to inject a malicious entry). */
  files?: Record<string, Uint8Array>;
}): Uint8Array {
  const index = {
    title: opts.title,
    revision: opts.revision ?? "2026-10-31",
    format: 3,
    author: "Fuchine tests",
    attribution: "Invented test data",
    url: "https://example.com/dict",
    sourceLanguage: opts.language ?? "ja",
    targetLanguage: opts.kind === "terms" ? opts.targetLanguage ?? opts.language ?? "ja" : undefined,
    ...(opts.frequencyMode ? { frequencyMode: opts.frequencyMode } : {}),
  };
  const files: Zippable = { "index.json": strToU8(JSON.stringify(index)) };

  if (opts.kind === "terms") {
    files["term_bank_1.json"] = strToU8(JSON.stringify([
      ["猫", "ねこ", "名", "", 10, [
        {
          type: "structured-content",
          content: [
            { tag: "span", style: { fontWeight: "bold", color: "red" }, content: "【猫】" },
            { tag: "ol", content: [
              { tag: "li", content: ["家で飼われる小さな", { tag: "ruby", content: ["獣", { tag: "rt", content: "けもの" }] }, "。"] },
              { tag: "li", data: { content: "x" }, content: { tag: "a", href: "https://example.com/neko", content: "出典" } },
            ] },
            { tag: "img", path: "img/neko.png", alt: "a cat" },
            { tag: "a", href: "javascript:alert(1)", content: "bad link" },
          ],
        },
      ], 1, ""],
      ["食べる", "たべる", "動", "v1", 5, ["食物を口に入れる。", { type: "text", text: "生活する。" }], 2, "common"],
      ["する", "", "", "vs", 1, [{ type: "image", path: "x.png" }, "行う。"], 3, ""],
      ["bad"], // malformed: counted as skipped
    ]));
    if (opts.extraTerms) files["term_bank_2.json"] = strToU8(JSON.stringify(opts.extraTerms));
    files["tag_bank_1.json"] = strToU8(JSON.stringify([["名", "partOfSpeech", 0, "noun", 0]]));
    files["img/neko.png"] = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    files["styles.css"] = strToU8("body { color: red }");
  }
  if (opts.kind === "freq") {
    files["term_meta_bank_1.json"] = strToU8(JSON.stringify([
      ["猫", "freq", { reading: "ねこ", frequency: { value: 120, displayValue: "120" } }],
      ["食べる", "freq", { reading: "たべる", frequency: 40 }],
      ["食べる", "freq", { reading: "たべる", frequency: { value: 900, displayValue: "900㋕" } }],
      ["する", "freq", 7],
      ["猫", "ipa", { reading: "ねこ", transcriptions: [{ ipa: "neko" }] }],
    ]));
  }
  if (opts.kind === "pitch") {
    files["term_meta_bank_1.json"] = strToU8(JSON.stringify([
      ["猫", "pitch", { reading: "ねこ", pitches: [{ position: 1 }, { position: "LHH" }] }],
      ["食べる", "pitch", { reading: "たべる", pitches: [{ position: 2, nasal: 1 }, { position: "LHLL" }] }],
    ]));
  }
  Object.assign(files, opts.files ?? {});
  return zipSync(files);
}
