// Verifies the per-video dictionary-lookup cache that the import pipeline relies
// on (backlog: import-pipeline-batching). Lives here because @fuchine/nlp has no
// test runner and the worker is the consumer that shares the cache across lines.
import { describe, it, expect } from "vitest";
import { resolveWordEntries } from "@fuchine/nlp";
import type { DictionaryProvider, Token, WordEntry } from "@fuchine/nlp";

const tok = (lemma: string, reading: string | null = null): Token => ({
  surface: lemma, lemma, reading, romaji: null, pos: "noun", wordEntryId: null,
});

class CountingDict implements DictionaryProvider {
  readonly language = "ja";
  lookups: string[] = [];
  async lookup(lemma: string): Promise<WordEntry[]> {
    this.lookups.push(lemma);
    return [{ id: `id:${lemma}`, reading: "r", lemma } as unknown as WordEntry];
  }
}

describe("resolveWordEntries shared cache", () => {
  it("looks a repeated lemma up once across lines when a cache is shared", async () => {
    const dict = new CountingDict();
    const cache = new Map<string, string | null>();
    await resolveWordEntries([tok("猫"), tok("は")], dict, cache);
    await resolveWordEntries([tok("猫"), tok("好き")], dict, cache);
    // 猫 resolved on line 1 and reused on line 2 — only は and 好き are new lookups.
    expect(dict.lookups).toEqual(["猫", "は", "好き"]);
  });

  it("resolves wordEntryId from the lookup hit", async () => {
    const dict = new CountingDict();
    const [t] = await resolveWordEntries([tok("猫")], dict, new Map());
    expect(t!.wordEntryId).toBe("id:猫");
  });

  it("defaults to a fresh cache per call, preserving standalone behavior", async () => {
    const dict = new CountingDict();
    await resolveWordEntries([tok("猫")], dict);
    await resolveWordEntries([tok("猫")], dict);
    expect(dict.lookups).toEqual(["猫", "猫"]);
  });
});
