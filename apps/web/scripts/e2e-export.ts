/**
 * End-to-end test for the Anki export (T3.3): Lapis + basic presets, the
 * curated filter, FSRS state tags and the review-history CSV.
 *
 * Runs the REAL lib functions (`mineSentence`, `reviewCardById`,
 * `getLapisExport`, `buildLapisTsv`, `getDeckCards`, `buildDeckTsv`,
 * `exportReviewLogsCsv`) against a live Postgres, with a tokenized line, its
 * dictionary entries and a Kanjium-style pitch fixture. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-export.ts
 */
import { eq } from "drizzle-orm";
import {
  type Token, createDb, sentenceCards, subtitleLines, users, videos, wordEntries, wordPitch,
} from "@fuchine/db";
import { GRADE } from "@fuchine/core";
import { mineSentence, reviewCardById } from "../lib/cards";
import {
  LAPIS_FIELDS, buildDeckTsv, buildLapisTsv, getDeckCards, getLapisExport, parseExportParams,
} from "../lib/export";
import { exportReviewLogsCsv } from "../lib/fsrs";

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

/** Parse an Anki TSV: `#` header directives + rows keyed by the #columns names. */
function parseTsv(tsv: string) {
  const lines = tsv.trimEnd().split("\n");
  const headers = lines.filter((l) => l.startsWith("#"));
  const columns = (headers.find((h) => h.startsWith("#columns:")) ?? "").slice("#columns:".length).split("\t");
  const rows = lines.filter((l) => !l.startsWith("#")).map((l) => {
    const cells = l.split("\t");
    return { cells, get: (name: string) => cells[columns.indexOf(name)] ?? "" };
  });
  return { headers, columns, rows };
}

async function main() {
  console.log("\n=== E2E: Anki export (Lapis + basic + FSRS state) ===\n");
  const stamp = Date.now();
  // A private language tag keeps the fixture entries/pitch apart from any
  // seeded JMdict/Kanjium rows (their unique keys include the language).
  const lang = `e2e-${stamp}`;
  const [user] = await db.insert(users).values({ email: `e2e-export-${stamp}@example.com` }).returning();
  const [other] = await db.insert(users).values({ email: `e2e-export-other-${stamp}@example.com` }).returning();
  const [video] = await db.insert(videos).values({
    source: "youtube", sourceId: `e2eexp${stamp}`, url: "https://www.youtube.com/watch?v=e2e",
    title: "Cats & <Dogs>", channel: "Pet TV", language: "ja", status: "done",
  }).returning();

  const [neko, taberu] = await db.insert(wordEntries).values([
    { language: lang, lemma: "猫", reading: "ねこ", pos: "n", frequencyRank: 2500,
      definitions: [{ glosses: ["cat"], partsOfSpeech: ["n"] }, { glosses: ["geisha"], partsOfSpeech: ["n"] }] },
    { language: lang, lemma: "食べる", reading: "たべる", pos: "v1", frequencyRank: 500,
      definitions: [{ glosses: ["to eat"], partsOfSpeech: ["v1"] }] },
  ]).returning();
  await db.insert(wordPitch).values([
    { language: lang, lemma: "猫", reading: "ねこ", positions: [1], source: "kanjium" },
    { language: lang, lemma: "食べる", reading: "たべる", positions: [2], source: "kanjium" },
  ]);

  const tok = (surface: string, reading: string | null, pos: string, wordEntryId: string | null, lemma = surface): Token =>
    ({ surface, lemma, reading, romaji: null, pos, wordEntryId });
  const lines = await db.insert(subtitleLines).values([
    {
      videoId: video.id, idx: 0, tStartMs: 61_500, tEndMs: 63_000, textOriginal: "猫が食べる",
      textTranslation: "The cat eats",
      tokens: [tok("猫", "ネコ", "名詞", neko!.id), tok("が", "ガ", "助詞", null), tok("食べる", "タベル", "動詞", taberu!.id)],
    },
    {
      videoId: video.id, idx: 1, tStartMs: 70_000, tEndMs: 71_000, textOriginal: "ね。", textTranslation: null,
      tokens: [tok("ね", "ネ", "助詞", null), tok("。", null, "記号", null)],
    },
  ]).returning();

  const mine = async (userId: string, idx: number) =>
    ((await mineSentence(db, userId, { subtitleLineId: lines[idx]!.id })).body.card as { id: string }).id;
  const curatedCard = await mine(user.id, 0);
  const uncuratedCard = await mine(user.id, 1);
  const otherCard = await mine(other.id, 0);
  await db.update(sentenceCards).set({ notes: "remember <this>" }).where(eq(sentenceCards.id, curatedCard));
  const reviewed = await reviewCardById(db, user.id, curatedCard, GRADE.Good);
  check("review => 200", reviewed.status === 200, reviewed);
  const [cardRow] = await db.select().from(sentenceCards).where(eq(sentenceCards.id, curatedCard));

  // --- 1. Lapis preset, all cards, with history tags ---
  console.log("1. Lapis preset");
  const opts = parseExportParams(new URLSearchParams("deck=Japanese::Mining&history=1"));
  if (!opts.ok) throw new Error(opts.error);
  const { cards, entries } = await getLapisExport(db, user.id, "all");
  const lapis = parseTsv(buildLapisTsv(cards, entries, opts.value));
  check("headers: notetype Lapis, deck, tags + guid columns", [
    "#separator:tab", "#html:true", "#notetype:Lapis", "#deck:Japanese::Mining", "#tags column:23", "#guid column:24",
  ].every((h) => lapis.headers.includes(h)), lapis.headers);
  check("columns = Lapis fields + Tags + GUID", lapis.columns.join(",") === [...LAPIS_FIELDS, "Tags", "GUID"].join(","), lapis.columns);
  check("only this user's two cards", lapis.rows.length === 2, lapis.rows.length);
  check("every row has 24 cells", lapis.rows.every((r) => r.cells.length === 24));
  const r0 = lapis.rows.find((r) => r.get("GUID") === `fuchine-${curatedCard}`);
  check("GUID is fuchine-<card id>", !!r0);
  if (r0) {
    const want: Record<string, string> = {
      Expression: "猫",
      ExpressionFurigana: "猫[ねこ]",
      ExpressionReading: "ねこ",
      ExpressionAudio: "",
      SentenceAudio: "",
      Picture: "",
      MainDefinition: "cat",
      Sentence: "<b>猫</b>が食べる",
      SentenceFurigana: "<b>猫[ねこ]</b>が 食[た]べる",
      Glossary: "<ol><li>cat</li><li>geisha</li></ol>",
      IsSentenceCard: "x",
      PitchPosition: "1",
      PitchCategories: "atamadaka",
      Frequency: '<ul style="text-align: left;"><li>JMdict: 2500</li></ul>',
      FreqSort: "2500",
    };
    for (const [k, v] of Object.entries(want)) check(`${k} = ${v || "(empty)"}`, r0.get(k) === v, r0.get(k));
    const misc = r0.get("MiscInfo");
    check("MiscInfo: translation, escaped notes, title link with &t=, channel",
      misc === 'The cat eats<br>remember &lt;this&gt;<br>' +
        `<a href="https://www.youtube.com/watch?v=e2eexp${stamp}&t=61s">Cats &amp; &lt;Dogs&gt;</a> · Pet TV`, misc);
    const tags = r0.get("Tags").split(" ");
    check("tags carry the FSRS state", tags.includes("fuchine::state::" + ["new", "learning", "review", "relearning"][cardRow!.state])
      && tags.includes(`fuchine::due::${cardRow!.due.toISOString().slice(0, 10)}`)
      && tags.includes("fuchine::reps::1") && tags.includes("fuchine::lapses::0"), tags);
    check("tags carry the video", tags.includes("fuchine::video::Cats_Dogs"), tags);
  }
  const r1 = lapis.rows.find((r) => r.get("GUID") === `fuchine-${uncuratedCard}`);
  check("a line without a content word falls back to the sentence", r1?.get("Expression") === "ね。" && r1?.get("FreqSort") === "9999999", r1?.cells);
  check("new card has no due tag", !!r1 && !r1.get("Tags").includes("fuchine::due::"), r1?.get("Tags"));

  // --- 2. Curated filter ---
  console.log("2. Curated filter");
  const curated = await getLapisExport(db, user.id, "curated");
  check("only the curated/reviewed card", curated.cards.length === 1 && curated.cards[0]!.cardId === curatedCard, curated.cards.map((c) => c.cardId));
  check("another user's card never exported", !cards.some((c) => c.cardId === otherCard));

  // --- 3. Basic preset (back-compat) ---
  console.log("3. Basic preset");
  const basic = parseTsv(buildDeckTsv(await getDeckCards(db, user.id, "all")));
  check("basic columns unchanged", basic.columns.join(",") === "Expression,Meaning,Notes,Source", basic.columns);
  check("basic has 2 rows of 4 cells", basic.rows.length === 2 && basic.rows.every((r) => r.cells.length === 4));
  check("basic row: sentence, meaning, source link", basic.rows[0]?.get("Expression") === "猫が食べる"
    && basic.rows[0]?.get("Meaning") === "The cat eats"
    && basic.rows[0]?.get("Source").includes(`&t=61s`), basic.rows[0]?.cells);
  check("basic curated filter", (await getDeckCards(db, user.id, "curated")).length === 1);

  // --- 4. Review history joins the deck by card id ---
  console.log("4. Review history");
  const csv = await exportReviewLogsCsv(db, user.id);
  const csvRows = csv.trim().split("\n").slice(1);
  check("one history row for the reviewed card", csvRows.length === 1 && csvRows[0]!.startsWith(`${curatedCard},`), csvRows);

  // Cleanup (cascades cards/logs).
  await db.delete(users).where(eq(users.id, user.id));
  await db.delete(users).where(eq(users.id, other.id));
  await db.delete(videos).where(eq(videos.id, video.id));
  await db.delete(wordPitch).where(eq(wordPitch.language, lang));
  await db.delete(wordEntries).where(eq(wordEntries.language, lang));

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
