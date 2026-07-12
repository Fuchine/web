// Verifies the batched dictionary lookup that the import pipeline uses to resolve
// every distinct lemma of a video in one round trip instead of one query per
// unique lemma (backlog: import-pipeline-batching item 2). Lives here because
// @fuchine/nlp has no test runner and the worker is the consumer.
import { describe, it, expect } from "vitest";
import { lookupLemmas, groupHitsByLemma, resolveTokensFromHits } from "@fuchine/nlp";
import type { DictionaryProvider, Token, WordEntry } from "@fuchine/nlp";

const entry = (id: string, lemma: string, reading: string | null): WordEntry =>
  ({ id, lemma, reading } as unknown as WordEntry);

const tok = (lemma: string, reading: string | null = null): Token => ({
  surface: lemma, lemma, reading, romaji: null, pos: "noun", wordEntryId: null,
});

/** Fake dictionary supporting the batch method; records how it was called. */
class BatchDict implements DictionaryProvider {
  readonly language = "ja";
  manyCalls: string[][] = [];
  singleCalls: string[] = [];
  constructor(private readonly rows: WordEntry[]) {}
  async lookup(lemma: string): Promise<WordEntry[]> {
    this.singleCalls.push(lemma);
    return this.rows.filter((r) => r.lemma === lemma || r.reading === lemma);
  }
  async lookupMany(lemmas: string[]): Promise<Map<string, WordEntry[]>> {
    this.manyCalls.push(lemmas);
    return groupHitsByLemma(this.rows, lemmas);
  }
}

/** Fake dictionary without the batch method — forces the fallback path. */
class SingleOnlyDict implements DictionaryProvider {
  readonly language = "ja";
  singleCalls: string[] = [];
  constructor(private readonly rows: WordEntry[]) {}
  async lookup(lemma: string): Promise<WordEntry[]> {
    this.singleCalls.push(lemma);
    return this.rows.filter((r) => r.lemma === lemma || r.reading === lemma);
  }
}

describe("groupHitsByLemma", () => {
  it("groups rows under every queried key they match by lemma OR reading, in order", () => {
    const rows = [entry("a", "猫", "ねこ"), entry("b", "子猫", "ねこ")];
    const g = groupHitsByLemma(rows, ["猫", "ねこ"]);
    expect(g.get("猫")!.map((r) => r.id)).toEqual(["a"]);
    // both rows read ねこ; order from the (frequency-sorted) input is preserved.
    expect(g.get("ねこ")!.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("does not double-count a row whose lemma equals its reading", () => {
    const g = groupHitsByLemma([entry("x", "猫", "猫")], ["猫"]);
    expect(g.get("猫")!.map((r) => r.id)).toEqual(["x"]);
  });

  it("caps each group at 20 hits (parity with the single lookup)", () => {
    const rows = Array.from({ length: 25 }, (_, i) => entry(`id${i}`, "する", "する"));
    const g = groupHitsByLemma(rows, ["する"]);
    expect(g.get("する")!.length).toBe(20);
  });
});

describe("lookupLemmas", () => {
  it("uses lookupMany once with deduped, non-empty lemmas when available", async () => {
    const dict = new BatchDict([entry("a", "猫", "ねこ")]);
    const hits = await lookupLemmas(["猫", "猫", "は", ""], dict);
    expect(dict.manyCalls.length).toBe(1);
    expect(dict.manyCalls[0]).toEqual(["猫", "は"]);
    expect(dict.singleCalls).toEqual([]);
    expect(hits.get("猫")!.map((r) => r.id)).toEqual(["a"]);
  });

  it("falls back to per-lemma lookup when the provider has no batch method", async () => {
    const dict = new SingleOnlyDict([entry("a", "猫", "ねこ")]);
    const hits = await lookupLemmas(["猫", "は"], dict);
    expect([...dict.singleCalls].sort()).toEqual(["は", "猫"].sort());
    expect(hits.get("猫")!.map((r) => r.id)).toEqual(["a"]);
    expect(hits.get("は") ?? []).toEqual([]);
  });
});

describe("resolveTokensFromHits", () => {
  const hits = new Map<string, WordEntry[]>([
    ["行く", [entry("a", "行く", "いく"), entry("b", "行く", "おこなう")]],
  ]);

  it("prefers the hit whose reading matches the token", () => {
    const [t] = resolveTokensFromHits([tok("行く", "おこなう")], hits);
    expect(t!.wordEntryId).toBe("b");
  });

  it("falls back to the first (most frequent) hit when no reading matches", () => {
    const [t] = resolveTokensFromHits([tok("行く", "なし")], hits);
    expect(t!.wordEntryId).toBe("a");
  });

  it("leaves wordEntryId null when nothing matches or the lemma is empty", () => {
    const [unknown, empty] = resolveTokensFromHits([tok("未知"), tok("")], hits);
    expect(unknown!.wordEntryId).toBeNull();
    expect(empty!.wordEntryId).toBeNull();
  });
});
