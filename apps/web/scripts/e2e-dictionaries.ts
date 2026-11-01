/**
 * End-to-end test for imported Yomitan dictionaries (T3.4).
 *
 * Imports hand-built fixture zips (terms, pitch, rank- and occurrence-based
 * frequency) with the REAL importer, then drives the REAL lookup
 * (`lookupById`), prefs (`updateDictionaryPrefs`, `getDictionarySettings`)
 * and Lapis export (`getLapisExport` + `buildLapisTsv`) against a live
 * Postgres. No mocks. The admin gate of the upload route is covered by its
 * route test (app/api/admin/dictionaries/route.test.ts).
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-dictionaries.ts
 */
import { and, count, eq, inArray } from "drizzle-orm";
import {
  type Token, createDb, dictionaries, dictionaryTerms, subtitleLines, users, videos, wordEntries,
  wordFrequency, wordPitch,
} from "@fuchine/db";
import { deleteDictionary, importYomitanZip, YomitanImportError } from "@fuchine/db/dictionaries";
import { buildYomitanFixture } from "@fuchine/db/dictionaries/fixture";
import { mineSentence } from "../lib/cards";
import { lookupById } from "../lib/dictionary";
import { getDictionarySettings, updateDictionaryPrefs } from "../lib/dictionaries";
import { buildLapisTsv, getLapisExport } from "../lib/export";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url);

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

// "zxx" (ISO 639: no linguistic content) keeps every row of this suite apart
// from seeded JMdict/Kanjium data, whose keys include the language.
const LANG = "zxx";

function lapisField(tsv: string, field: string): string {
  const lines = tsv.trimEnd().split("\n");
  const columns = lines.find((l) => l.startsWith("#columns:"))!.slice("#columns:".length).split("\t");
  const row = lines.find((l) => !l.startsWith("#"))!.split("\t");
  return row[columns.indexOf(field)] ?? "";
}

async function main() {
  console.log("\n=== E2E: Yomitan dictionaries (import, per-user lookup, export) ===\n");
  const stamp = Date.now();
  const T = (s: string) => `E2E ${s} ${stamp}`;
  const ids: string[] = [];

  // Clean up any leftovers of this language from a crashed run.
  await db.delete(wordPitch).where(eq(wordPitch.language, LANG));
  await db.delete(wordEntries).where(eq(wordEntries.language, LANG));

  // --- 1. Import ---
  console.log("1. Import");
  const mono = await importYomitanZip(db, buildYomitanFixture({ title: T("Mono"), kind: "terms", language: LANG }));
  const je = await importYomitanZip(
    db,
    buildYomitanFixture({
      title: T("JE"), kind: "terms", language: LANG, targetLanguage: "en",
      files: {
        "term_bank_1.json": new TextEncoder().encode(JSON.stringify([
          ["猫", "ねこ", "n", "", 0, ["cat (from J-E)"], 1, ""],
          ["猫", "びょう", "n", "", 0, ["cat (Sino-Japanese reading)"], 2, ""],
        ])),
      },
    }),
  );
  const pitch = await importYomitanZip(db, buildYomitanFixture({ title: T("Pitch"), kind: "pitch", language: LANG }));
  const freq = await importYomitanZip(db, buildYomitanFixture({ title: T("Freq"), kind: "freq", language: LANG, frequencyMode: "rank-based" }));
  const occ = await importYomitanZip(db, buildYomitanFixture({ title: T("Occ"), kind: "freq", language: LANG, frequencyMode: "occurrence-based" }));
  ids.push(mono.id, je.id, pitch.id, freq.id, occ.id);
  check("terms dictionary: 3 terms, 1 malformed row skipped", mono.type === "terms" && mono.terms === 3 && mono.skipped === 1, mono);
  check("pitch dictionary: 2 pitch rows, type pitch", pitch.type === "pitch" && pitch.pitches === 2, pitch);
  check("frequency dictionary: 3 (term, reading) ranks (duplicate merged)", freq.type === "frequency" && freq.frequencies === 3, freq);
  const [freqTaberu] = await db.select().from(wordFrequency)
    .where(and(eq(wordFrequency.dictionaryId, freq.id), eq(wordFrequency.expression, "食べる")));
  check("rank-based duplicate keeps the best rank (40, not 900)", freqTaberu?.rank === 40, freqTaberu);
  const occRows = await db.select().from(wordFrequency).where(eq(wordFrequency.dictionaryId, occ.id));
  const occRank = Object.fromEntries(occRows.map((r) => [r.expression, r.rank]));
  check("occurrence-based list ranks by descending count (食べる 900 → 1, 猫 120 → 2, する 7 → 3)",
    occRank["食べる"] === 1 && occRank["猫"] === 2 && occRank["する"] === 3, occRank);
  const [pitchRow] = await db.select().from(wordPitch)
    .where(and(eq(wordPitch.dictionaryId, pitch.id), eq(wordPitch.lemma, "猫")));
  check("pitch stored in word_pitch with source = title, HL string converted", pitchRow?.source === T("Pitch") &&
    JSON.stringify(pitchRow.positions) === "[1,0]", pitchRow);

  // --- 2. Re-import is idempotent ---
  console.log("2. Re-import");
  const again = await importYomitanZip(db, buildYomitanFixture({ title: T("Mono"), revision: "2026-11-01", kind: "terms", language: LANG }));
  const [{ n }] = await db.select({ n: count() }).from(dictionaryTerms).where(eq(dictionaryTerms.dictionaryId, mono.id));
  check("same title → same id, marked replaced", again.id === mono.id && again.replaced, again);
  check("no duplicated rows after re-import (3 terms)", n === 3, n);
  const [monoRow] = await db.select().from(dictionaries).where(eq(dictionaries.id, mono.id));
  check("revision updated", monoRow?.revision === "2026-11-01", monoRow?.revision);
  const pitchAgain = await importYomitanZip(db, buildYomitanFixture({ title: T("Pitch"), kind: "pitch", language: LANG }));
  const [{ n: pn }] = await db.select({ n: count() }).from(wordPitch).where(eq(wordPitch.dictionaryId, pitch.id));
  check("pitch re-import keeps 2 rows", pitchAgain.id === pitch.id && pn === 2, pn);
  let rejected = false;
  try {
    await importYomitanZip(db, buildYomitanFixture({ title: T("Bad"), kind: "freq", language: LANG, files: { "../x.json": new Uint8Array([1]) } }));
  } catch (e) {
    rejected = e instanceof YomitanImportError;
  }
  const [{ n: badN }] = await db.select({ n: count() }).from(dictionaries).where(eq(dictionaries.title, T("Bad")));
  check("zip-slip archive rejected, nothing written", rejected && badN === 0, { rejected, badN });

  // --- 3. Per-user lookup ---
  console.log("3. Lookup per user");
  const [neko, taberu] = await db.insert(wordEntries).values([
    { language: LANG, lemma: "猫", reading: "ねこ", pos: "n", frequencyRank: 2500, definitions: [{ glosses: ["cat"], partsOfSpeech: ["n"] }] },
    { language: LANG, lemma: "食べる", reading: "たべる", pos: "v1", frequencyRank: 500, definitions: [{ glosses: ["to eat"], partsOfSpeech: ["v1"] }] },
  ]).returning();
  await db.insert(wordPitch).values({ language: LANG, lemma: "猫", reading: "ねこ", positions: [1], source: "kanjium" });

  const [alice] = await db.insert(users).values({ email: `e2e-dict-a-${stamp}@example.com` }).returning();
  const [bob] = await db.insert(users).values({ email: `e2e-dict-b-${stamp}@example.com` }).returning();

  const bad = await updateDictionaryPrefs(db, alice!.id, { enabled: ["00000000-0000-4000-8000-000000000000"], frequency: null });
  check("prefs: unknown id → 400", bad.status === 400, bad);
  const notFreq = await updateDictionaryPrefs(db, alice!.id, { enabled: [], frequency: mono.id });
  check("prefs: FreqSort list without frequency data → 400", notFreq.status === 400, notFreq);
  const dup = await updateDictionaryPrefs(db, alice!.id, { enabled: [mono.id, mono.id] });
  check("prefs: repeated id → 400", dup.status === 400, dup);
  const ok = await updateDictionaryPrefs(db, alice!.id, { enabled: [je.id, mono.id, pitch.id, freq.id], frequency: occ.id });
  check("prefs saved", ok.status === 200, ok);
  const settings = await getDictionarySettings(db, alice!.id);
  check("settings echo the order and FreqSort list",
    JSON.stringify(settings.enabled) === JSON.stringify([je.id, mono.id, pitch.id, freq.id]) && settings.frequency === occ.id, settings);

  const a = await lookupById(db, neko!.id, alice!.id);
  const titles = a?.dictionaries.map((s) => s.title) ?? [];
  check("Alice sees both term dictionaries in her order (JE, then Mono)",
    JSON.stringify(titles) === JSON.stringify([T("JE"), T("Mono")]), titles);
  const jeSec = a?.dictionaries.find((s) => s.dictionaryId === je.id);
  check("exact reading wins: only 猫【ねこ】 from JE, not 猫【びょう】",
    jeSec?.entries.length === 1 && jeSec.entries[0]!.reading === "ねこ", jeSec?.entries);
  check("monolingual flag: Mono yes, JE no",
    a?.dictionaries.find((s) => s.dictionaryId === mono.id)?.monolingual === true && jeSec?.monolingual === false);
  const monoDef = JSON.stringify(a?.dictionaries.find((s) => s.dictionaryId === mono.id)?.entries[0]?.definitions);
  check("structured content arrives sanitized (no img, no javascript:, keeps ruby)",
    !monoDef.includes("img") && !monoDef.includes("javascript") && monoDef.includes("\"rt\""), monoDef);
  check("Alice's pitch: Kanjium first, then the imported pitch dictionary",
    JSON.stringify(a?.pitch.map((p) => p.source)) === JSON.stringify(["kanjium", T("Pitch")]), a?.pitch);
  check("Alice's frequencies: only the enabled list (Freq rank 120)",
    JSON.stringify(a?.frequencies.map((f) => [f.title, f.rank, f.display])) === JSON.stringify([[T("Freq"), 120, "120"]]), a?.frequencies);

  const b = await lookupById(db, neko!.id, bob!.id);
  check("Bob (nothing enabled): no imported sections or ranks",
    b?.dictionaries.length === 0 && b?.frequencies.length === 0, { d: b?.dictionaries, f: b?.frequencies });
  check("Bob: only the seeded pitch source", JSON.stringify(b?.pitch.map((p) => p.source)) === JSON.stringify(["kanjium"]), b?.pitch);
  const anon = await lookupById(db, neko!.id);
  check("no user → JMdict + Kanjium only", anon?.dictionaries.length === 0 && anon?.pitch.length === 1);

  await updateDictionaryPrefs(db, alice!.id, { enabled: [mono.id, je.id], frequency: occ.id });
  const reordered = await lookupById(db, neko!.id, alice!.id);
  check("reordering is respected (Mono, then JE)",
    JSON.stringify(reordered?.dictionaries.map((s) => s.title)) === JSON.stringify([T("Mono"), T("JE")]));
  const kanaWord = await lookupById(db, taberu!.id, alice!.id);
  check("食べる found by expression+reading", kanaWord?.dictionaries[0]?.entries[0]?.expression === "食べる", kanaWord?.dictionaries);

  await db.update(dictionaries).set({ enabled: false }).where(eq(dictionaries.id, je.id));
  const disabled = await lookupById(db, neko!.id, alice!.id);
  check("an admin-disabled dictionary disappears for everyone",
    JSON.stringify(disabled?.dictionaries.map((s) => s.title)) === JSON.stringify([T("Mono")]), disabled?.dictionaries.map((s) => s.title));
  await db.update(dictionaries).set({ enabled: true }).where(eq(dictionaries.id, je.id));

  // --- 4. Lapis export uses the chosen frequency list ---
  console.log("4. Lapis FreqSort");
  const [video] = await db.insert(videos).values({
    source: "youtube", sourceId: `e2edict${stamp}`, url: "https://www.youtube.com/watch?v=e2e",
    title: "Dict test", language: LANG, status: "done",
  }).returning();
  const tok = (surface: string, reading: string | null, pos: string, wordEntryId: string | null): Token =>
    ({ surface, lemma: surface, reading, romaji: null, pos, wordEntryId });
  const [line] = await db.insert(subtitleLines).values({
    videoId: video!.id, idx: 0, tStartMs: 1000, tEndMs: 2000, textOriginal: "猫が",
    tokens: [tok("猫", "ネコ", "名詞", neko!.id), tok("が", "ガ", "助詞", null)],
  }).returning();
  for (const u of [alice!, bob!]) await mineSentence(db, u.id, { subtitleLineId: line!.id });

  const lapis = async (userId: string) => {
    const { cards, entries } = await getLapisExport(db, userId, "all");
    return buildLapisTsv(cards, entries, { deck: "Test", history: false });
  };
  const aliceTsv = await lapis(alice!.id);
  check("Alice: FreqSort = rank in her chosen (occurrence-based) list", lapisField(aliceTsv, "FreqSort") === "2", lapisField(aliceTsv, "FreqSort"));
  check("Alice: Frequency lists the chosen list, then JMdict",
    lapisField(aliceTsv, "Frequency") === `<ul style="text-align: left;"><li>${T("Occ")}: 120</li><li>JMdict: 2500</li></ul>`,
    lapisField(aliceTsv, "Frequency"));
  check("Alice: PitchPosition excludes the pitch dictionary she disabled", lapisField(aliceTsv, "PitchPosition") === "1", lapisField(aliceTsv, "PitchPosition"));
  const bobTsv = await lapis(bob!.id);
  check("Bob: FreqSort falls back to the JMdict rank", lapisField(bobTsv, "FreqSort") === "2500", lapisField(bobTsv, "FreqSort"));

  // --- 5. Delete cascades ---
  console.log("5. Delete");
  await deleteDictionary(db, pitch.id);
  const [{ n: left }] = await db.select({ n: count() }).from(wordPitch).where(eq(wordPitch.source, T("Pitch")));
  check("deleting a pitch dictionary removes its word_pitch rows", left === 0, left);
  const after = await getDictionarySettings(db, alice!.id);
  check("a deleted dictionary drops out of users' choices", !after.installed.some((d) => d.id === pitch.id));

  // Cleanup
  await db.delete(users).where(inArray(users.id, [alice!.id, bob!.id]));
  await db.delete(videos).where(eq(videos.id, video!.id));
  for (const id of ids) await deleteDictionary(db, id);
  await db.delete(wordPitch).where(eq(wordPitch.language, LANG));
  await db.delete(wordEntries).where(eq(wordEntries.language, LANG));

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
