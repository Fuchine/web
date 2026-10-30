/**
 * End-to-end test for dictionary lookups (F1 popup + F2 search).
 *
 * Drives the REAL functions (`lookupById`, `searchDictionary`,
 * apps/web/lib/dictionary.ts) over a live Postgres + the JaDictionary adapter.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-dictionary.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { and, inArray, eq } from "drizzle-orm";
import {
  createDb, wordEntries, wordExamples, wordPitch, subtitleLines, videos,
  type Database, type Definition,
} from "@fuchine/db";
import { KANJIUM_SOURCE, parseKanjiumAccents, seedPitchFile } from "@fuchine/db/seed/pitch";
import { pitchPattern } from "@fuchine/core";
import { lookupById, searchDictionary, getWordExamples, searchByGloss, withPitch } from "../lib/dictionary";

// Committed Kanjium excerpt (T3.2) — the same file `seed:pitch:fixture` loads.
const PITCH_FIXTURE = fileURLToPath(
  new URL("../../../packages/db/seeds/fixtures/kanjium-accents-sample.txt", import.meta.url),
);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url) as Database;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

async function main() {
  console.log("\n=== E2E: dictionary ===\n");

  // A sentinel gloss makes the meaning-search assertion deterministic even
  // against a fully seeded dictionary (where "cat" is a substring of category,
  // cattle, … across thousands of real entries).
  const nekoGloss = "e2eglosssentinelcat";
  const nekoDef: Definition[] = [{ glosses: ["cat", nekoGloss], partsOfSpeech: ["n"], tags: ["usually kana"] }];
  // glosses_text is materialized from definitions (the seed does this); the
  // meaning search reads that column, so fixtures must populate it too.
  const glossesOf = (defs: Definition[]) => defs.flatMap((d) => d.glosses).join(" ") || null;
  const bridgeDef: Definition[] = [{ glosses: ["bridge"], partsOfSpeech: ["n"] }];
  const chopsticksDef: Definition[] = [{ glosses: ["chopsticks"], partsOfSpeech: ["n"] }];
  // Two homophones (reading はし) with different frequency to test ordering.
  const inserted = await db
    .insert(wordEntries)
    .values([
      { language: "ja", lemma: "猫", reading: "ねこ", pos: "noun", definitions: nekoDef, glossesText: glossesOf(nekoDef), frequencyRank: 1000 },
      { language: "ja", lemma: "橋", reading: "はし", pos: "noun", definitions: bridgeDef, glossesText: glossesOf(bridgeDef), frequencyRank: 800 },
      { language: "ja", lemma: "箸", reading: "はし", pos: "noun", definitions: chopsticksDef, glossesText: glossesOf(chopsticksDef), frequencyRank: 300 },
    ])
    .onConflictDoNothing()
    .returning();
  const nekoId = inserted.find((e) => e.lemma === "猫")!.id;
  const ids = inserted.map((e) => e.id);

  // --- 1. lookupById ---
  console.log("1. lookupById");
  const byId = await lookupById(db, nekoId);
  check("returns the entry", byId?.id === nekoId);
  check("carries lemma + reading", byId?.lemma === "猫" && byId?.reading === "ねこ", { lemma: byId?.lemma, reading: byId?.reading });
  check("carries definitions (jsonb)", byId?.definitions?.[0]?.glosses?.[0] === "cat", byId?.definitions);
  check("unknown id => null", (await lookupById(db, "00000000-0000-0000-0000-000000000000")) === null);

  // --- 2. searchDictionary ---
  console.log("2. searchDictionary");
  const byLemma = await searchDictionary(db, "猫");
  check("match by lemma", byLemma.length === 1 && byLemma[0]!.lemma === "猫", byLemma.map((e) => e.lemma));

  const byReading = await searchDictionary(db, "ねこ");
  check("match by reading", byReading.length === 1 && byReading[0]!.lemma === "猫", byReading.map((e) => e.lemma));

  const homophones = await searchDictionary(db, "はし");
  check("reading hit returns both homophones", homophones.length === 2, homophones.map((e) => e.lemma));
  check("ordered by frequency (箸 300 before 橋 800)", homophones[0]!.lemma === "箸" && homophones[1]!.lemma === "橋", homophones.map((e) => `${e.lemma}:${e.frequencyRank}`));

  const miss = await searchDictionary(db, "存在しない語");
  check("no match => []", miss.length === 0, miss);

  // --- 3. getWordExamples ---
  console.log("3. getWordExamples");
  const [vid] = await db
    .insert(videos)
    .values({
      source: "youtube",
      sourceId: `e2e-dict-${Date.now()}`,
      url: "https://www.youtube.com/watch?v=e2e-dict",
      title: "E2E dict examples",
      language: "ja",
      status: "done",
    })
    .returning();
  const [line] = await db
    .insert(subtitleLines)
    .values({
      videoId: vid.id,
      idx: 0,
      tStartMs: 4200,
      tEndMs: 6000,
      textOriginal: "猫が好き",
      textTranslation: "I like cats",
      tokens: [],
    })
    .returning();
  await db.insert(wordExamples).values({
    wordEntryId: nekoId,
    subtitleLineId: line.id,
    videoId: vid.id,
  });

  const examples = await getWordExamples(db, nekoId);
  check("one example for 猫", examples.length === 1, examples.length);
  check("example carries the sentence", examples[0]?.text === "猫が好き", examples[0]?.text);
  check("example carries the translation", examples[0]?.translation === "I like cats");
  check("example carries the start ms", examples[0]?.startMs === 4200, examples[0]?.startMs);
  check("example carries the video + line ids", examples[0]?.videoId === vid.id && examples[0]?.lineId === line.id);
  check("word with no occurrences => []", (await getWordExamples(db, ids[1]!)).length === 0);

  // --- 4. searchByGloss (English meaning) ---
  console.log("4. searchByGloss");
  const byGloss = await searchByGloss(db, nekoGloss);
  check("gloss search finds 猫 by its meaning", byGloss.some((e) => e.lemma === "猫"), byGloss.map((e) => e.lemma));
  check("no gloss match => []", (await searchByGloss(db, "zzzznomatch")).length === 0);

  // --- 5. pitch accent (T3.2): fixture seed + entry payloads ---
  console.log("5. pitch accent");
  const fixtureRows = parseKanjiumAccents(readFileSync(PITCH_FIXTURE, "utf8"));
  const fixtureKey = (r: { lemma: string; reading: string }) => `${r.lemma}\t${r.reading}`;
  // Only remove at cleanup what this run added (a fully seeded DB keeps its rows).
  const preexisting = new Set(
    (
      await db
        .select({ lemma: wordPitch.lemma, reading: wordPitch.reading })
        .from(wordPitch)
        .where(
          and(
            eq(wordPitch.source, KANJIUM_SOURCE),
            inArray(wordPitch.lemma, [...new Set(fixtureRows.map((r) => r.lemma))]),
          ),
        )
    ).map(fixtureKey),
  );
  const countFixture = async () =>
    (
      await db
        .select({ lemma: wordPitch.lemma, reading: wordPitch.reading })
        .from(wordPitch)
        .where(and(eq(wordPitch.source, KANJIUM_SOURCE), inArray(wordPitch.lemma, fixtureRows.map((r) => r.lemma))))
    ).filter((r) => fixtureRows.some((f) => fixtureKey(f) === fixtureKey(r))).length;

  const written = await seedPitchFile(db, PITCH_FIXTURE);
  check("fixture seed writes one row per (lemma, reading)", written === fixtureRows.length, { written, parsed: fixtureRows.length });
  const afterFirst = await countFixture();
  await seedPitchFile(db, PITCH_FIXTURE);
  check("re-seeding is idempotent (no duplicates)", (await countFixture()) === afterFirst && afterFirst === fixtureRows.length, { afterFirst });

  const nekoP = await lookupById(db, nekoId);
  check("lookupById carries pitch (猫 ねこ [1], Kanjium)", JSON.stringify(nekoP?.pitch) === JSON.stringify([{ reading: "ねこ", positions: [1], source: "kanjium" }]), nekoP?.pitch);
  const nekoPat = nekoP?.pitch[0] ? pitchPattern(nekoP.pitch[0].reading, nekoP.pitch[0].positions[0]!) : null;
  check("payload renders as atamadaka", nekoPat?.category === "atamadaka", nekoPat);

  const hashi = await searchDictionary(db, "はし");
  const pos = (lemma: string) => hashi.find((e) => e.lemma === lemma)?.pitch.map((p) => p.positions);
  check("search payload: 箸 はし [1] (atamadaka)", JSON.stringify(pos("箸")) === "[[1]]", pos("箸"));
  check("search payload: 橋 はし [2] (odaka) — homophones keep their own accent", JSON.stringify(pos("橋")) === "[[2]]", pos("橋"));

  const glossP = await searchByGloss(db, nekoGloss);
  check("gloss search payload carries pitch", glossP.find((e) => e.lemma === "猫")?.pitch.length === 1, glossP.map((e) => e.pitch));

  const none = await withPitch(db, [
    { language: "ja", lemma: "存在しない語", reading: "そんざいしないご" },
    { language: "ja", lemma: "猫", reading: null },
    { language: "ja", lemma: "猫", reading: "ぬこ" },
  ]);
  check("no pitch row / no reading / other reading => pitch: []", none.every((e) => e.pitch.length === 0), none);

  // --- Cleanup ---
  const added = fixtureRows.filter((r) => !preexisting.has(fixtureKey(r)));
  for (const r of added) {
    await db
      .delete(wordPitch)
      .where(and(eq(wordPitch.source, KANJIUM_SOURCE), eq(wordPitch.lemma, r.lemma), eq(wordPitch.reading, r.reading)));
  }
  await db.delete(videos).where(eq(videos.id, vid.id));
  await db.delete(wordEntries).where(inArray(wordEntries.id, ids));

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

async function closeDb() {
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch(async (err) => {
  console.error("E2E crashed:", err);
  await closeDb();
  process.exit(1);
});
