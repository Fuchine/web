/**
 * End-to-end test for dictionary lookups (F1 popup + F2 search).
 *
 * Drives the REAL functions (`lookupById`, `searchDictionary`,
 * apps/web/lib/dictionary.ts) over a live Postgres + the JaDictionary adapter.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-dictionary.ts
 */
import { inArray } from "drizzle-orm";
import { createDb, wordEntries, type Database, type Definition } from "@fuchine/db";
import { lookupById, searchDictionary } from "../lib/dictionary";

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

  const nekoDef: Definition[] = [{ glosses: ["cat"], partsOfSpeech: ["n"], tags: ["usually kana"] }];
  // Two homophones (reading はし) with different frequency to test ordering.
  const inserted = await db
    .insert(wordEntries)
    .values([
      { language: "ja", lemma: "猫", reading: "ねこ", pos: "noun", definitions: nekoDef, frequencyRank: 1000 },
      { language: "ja", lemma: "橋", reading: "はし", pos: "noun", definitions: [{ glosses: ["bridge"], partsOfSpeech: ["n"] }], frequencyRank: 800 },
      { language: "ja", lemma: "箸", reading: "はし", pos: "noun", definitions: [{ glosses: ["chopsticks"], partsOfSpeech: ["n"] }], frequencyRank: 300 },
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

  // --- Cleanup ---
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
