/**
 * End-to-end test for per-user token corrections (T3.7).
 *
 * Runs the REAL lib functions (`putTokenOverride`, `deleteTokenOverrides`,
 * `getVideoWithLines`, `getReviewQueue`, `reviewCardById`, `listUncuratedCards`,
 * `getLapisExport` + `buildLapisTsv`, `recordProgress`) against a live
 * Postgres. No mocks. Covers: a correction persists and shows up in the player
 * payload, the review queue, the curation page and the Lapis export for the
 * same user only; the line text can't change; reset (span + whole line);
 * stats follow the corrected entry; line and user deletes cascade.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-token-overrides.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  type Token, createDb, subtitleLines, tokenOverrides, userWordStats, users, videos, wordEntries,
} from "@fuchine/db";
import { GRADE } from "@fuchine/core";
import { getReviewQueue, mineSentence, reviewCardById } from "../lib/cards";
import { buildLapisTsv, getLapisExport } from "../lib/export";
import { listUncuratedCards } from "../lib/phrases";
import { recordProgress } from "../lib/progress";
import { getVideoWithLines } from "../lib/study";
import { deleteTokenOverrides, putTokenOverride } from "../lib/token-overrides";

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

const surfaces = (tokens: { surface: string }[]) => tokens.map((t) => t.surface).join("|");

function lapisRow(tsv: string, cardId: string) {
  const lines = tsv.trimEnd().split("\n");
  const columns = (lines.find((h) => h.startsWith("#columns:")) ?? "").slice("#columns:".length).split("\t");
  const row = lines.filter((l) => !l.startsWith("#")).map((l) => l.split("\t")).find((c) => c[columns.indexOf("GUID")] === `fuchine-${cardId}`);
  return (name: string) => row?.[columns.indexOf(name)] ?? "";
}

async function main() {
  console.log("\n=== E2E: per-user token corrections (T3.7) ===\n");
  const stamp = Date.now();
  const lang = `e2e-${stamp}`; // private tag: explicit-id fixtures never collide with JMdict
  const [userA] = await db.insert(users).values({ email: `e2e-tok-a-${stamp}@example.com` }).returning();
  const [userB] = await db.insert(users).values({ email: `e2e-tok-b-${stamp}@example.com` }).returning();
  const [video] = await db.insert(videos).values({
    source: "youtube", sourceId: `e2etok${stamp}`, url: "https://www.youtube.com/watch?v=e2e",
    title: "Token fixes", language: "ja", status: "done",
  }).returning();

  // マーク is resolved automatically through JaDictionary (language "ja"): reuse
  // the (ja, マーク, まーく) row if the DB is seeded, else create it.
  const [insertedMark] = await db.insert(wordEntries).values({
    language: "ja", lemma: "マーク", reading: "まーく", pos: "n",
    definitions: [{ glosses: ["mark"], partsOfSpeech: ["n"] }],
  }).onConflictDoNothing().returning();
  const [mark] = await db.select().from(wordEntries)
    .where(and(eq(wordEntries.language, "ja"), eq(wordEntries.lemma, "マーク"), eq(wordEntries.reading, "まーく")));
  const [san, ookii, matsu] = await db.insert(wordEntries).values([
    { language: lang, lemma: "さん", reading: "さん", pos: "suf", frequencyRank: 50, definitions: [{ glosses: ["Mr.; Ms."], partsOfSpeech: ["suf"] }] },
    { language: lang, lemma: "大きい", reading: "おおきい", pos: "adj-i", frequencyRank: 300, definitions: [{ glosses: ["big"], partsOfSpeech: ["adj-i"] }] },
    { language: lang, lemma: "待つ", reading: "まつ", pos: "v5t", frequencyRank: 100, definitions: [{ glosses: ["to wait"], partsOfSpeech: ["v5t"] }] },
  ]).returning();

  const tok = (surface: string, reading: string | null, pos: string, wordEntryId: string | null, lemma = surface): Token =>
    ({ surface, lemma, reading, romaji: null, pos, wordEntryId });
  // The usual pipeline errors: マー|ク (ー splits a name), 1|0分 (counter), 大きく read おうきく.
  const line0Tokens = [
    tok("マー", "まー", "名詞", null), tok("ク", "く", "名詞", null), tok("さん", "さん", "名詞", san!.id),
    tok("は", "は", "助詞", null), tok("1", "いち", "名詞", null), tok("0分", "ぜろふん", "名詞", null),
    tok("待つ", "まつ", "動詞", matsu!.id),
  ];
  const line1Tokens = [tok("大きく", "おうきく", "形容詞", ookii!.id, "大きい"), tok("なる", "なる", "動詞", null)];
  const [line0, line1] = await db.insert(subtitleLines).values([
    { videoId: video.id, idx: 0, tStartMs: 1000, tEndMs: 3000, textOriginal: "マークさんは10分待つ", tokens: line0Tokens },
    { videoId: video.id, idx: 1, tStartMs: 4000, tEndMs: 5000, textOriginal: "大きくなる", tokens: line1Tokens },
  ]).returning();

  const mine = async (userId: string, lineId: string) =>
    ((await mineSentence(db, userId, { subtitleLineId: lineId })).body.card as { id: string }).id;
  const cardA0 = await mine(userA.id, line0!.id);
  const cardA1 = await mine(userA.id, line1!.id);
  const cardB0 = await mine(userB.id, line0!.id);
  const cardB1 = await mine(userB.id, line1!.id);

  try {
    // --- 1. Save corrections ---
    console.log("1. PUT corrections");
    const merge = await putTokenOverride(db, userA.id, line0!.id, {
      startIdx: 0, endIdx: 1, tokens: [{ surface: "マーク", reading: "マーク" }],
    });
    check("ー merge => 200", merge.status === 200, merge);
    const mergeTokens = merge.body.tokens as Token[];
    check("merged tokens: マーク|さん|…", surfaces(mergeTokens) === "マーク|さん|は|1|0分|待つ", surfaces(mergeTokens));
    check("katakana reading normalized to hiragana", mergeTokens[0]?.reading === "まーく", mergeTokens[0]);
    check("wordEntryId re-resolved via the dictionary", mergeTokens[0]?.wordEntryId === mark!.id, mergeTokens[0]);
    check("response carries the new entry", Boolean((merge.body.wordEntries as Record<string, unknown>)[mark!.id]));
    check("tokenSpans mark the corrected block",
      JSON.stringify((merge.body.tokenSpans as unknown[])[0]) === JSON.stringify({ start: 0, end: 1, corrected: true }), merge.body.tokenSpans);

    const counter = await putTokenOverride(db, userA.id, line0!.id, {
      startIdx: 4, endIdx: 5, tokens: [{ surface: "10分", reading: "じゅっぷん", wordEntryId: null }],
    });
    const counterTok = (counter.body.tokens as Token[])[3];
    check("counter merge => 200, 10分 read じゅっぷん", counter.status === 200 && counterTok?.surface === "10分"
      && counterTok.reading === "じゅっぷん" && counterTok.romaji === "juppun" && counterTok.wordEntryId === null, counterTok);

    const reading = await putTokenOverride(db, userA.id, line1!.id, {
      startIdx: 0, endIdx: 0, tokens: [{ surface: "大きく", lemma: "大きい", reading: "おおきく", wordEntryId: ookii!.id }],
    });
    check("reading fix => 200 (entry kept)", reading.status === 200
      && (reading.body.tokens as Token[])[0]?.reading === "おおきく" && (reading.body.tokens as Token[])[0]?.wordEntryId === ookii!.id, reading.body);

    const rows = await db.select().from(tokenOverrides).where(eq(tokenOverrides.userId, userA.id));
    check("3 override rows persisted for A", rows.length === 3, rows.length);

    // --- 2. Invalid corrections ---
    console.log("2. Validation");
    const changeText = await putTokenOverride(db, userA.id, line0!.id, { startIdx: 2, endIdx: 2, tokens: [{ surface: "さま" }] });
    check("surface that changes the text => 400", changeText.status === 400 && /cannot change/.test(String(changeText.body.error)), changeText);
    const partial = await putTokenOverride(db, userA.id, line0!.id, { startIdx: 1, endIdx: 2, tokens: [{ surface: "クさん" }] });
    check("partial overlap with a correction => 400", partial.status === 400 && /overlaps/.test(String(partial.body.error)), partial);
    const badReading = await putTokenOverride(db, userA.id, line0!.id, { startIdx: 6, endIdx: 6, tokens: [{ surface: "待つ", reading: "matsu" }] });
    check("non-kana reading => 400", badReading.status === 400, badReading);
    const unknownId = await putTokenOverride(db, userA.id, line0!.id, {
      startIdx: 6, endIdx: 6, tokens: [{ surface: "待つ", wordEntryId: "00000000-0000-4000-8000-000000000000" }],
    });
    check("unknown wordEntryId => 400", unknownId.status === 400, unknownId);
    const outside = await putTokenOverride(db, userA.id, line0!.id, { startIdx: 6, endIdx: 7, tokens: [{ surface: "待つ" }] });
    check("span outside the line => 400", outside.status === 400, outside);
    const missing = await putTokenOverride(db, userA.id, "00000000-0000-4000-8000-000000000000", { startIdx: 0, endIdx: 0, tokens: [{ surface: "x" }] });
    check("unknown line => 404", missing.status === 404, missing);
    const [shared] = await db.select({ tokens: subtitleLines.tokens }).from(subtitleLines).where(eq(subtitleLines.id, line0!.id));
    check("shared line tokens untouched", surfaces(shared!.tokens) === surfaces(line0Tokens), surfaces(shared!.tokens));

    // --- 3. Player payload ---
    console.log("3. Player payload");
    const payloadA = await getVideoWithLines(db, video.id, { userId: userA.id });
    const payloadB = await getVideoWithLines(db, video.id, { userId: userB.id });
    const anon = await getVideoWithLines(db, video.id);
    check("A sees the corrected line", surfaces(payloadA!.lines[0]!.tokens) === "マーク|さん|は|10分|待つ", surfaces(payloadA!.lines[0]!.tokens));
    check("A's line carries tokenSpans", payloadA!.lines[0]!.tokenSpans?.length === 5, payloadA!.lines[0]!.tokenSpans);
    check("A sees おおきく", payloadA!.lines[1]!.tokens[0]?.reading === "おおきく");
    check("B sees the shared tokens", surfaces(payloadB!.lines[0]!.tokens) === surfaces(line0Tokens) && !payloadB!.lines[0]!.tokenSpans);
    check("B still sees おうきく", payloadB!.lines[1]!.tokens[0]?.reading === "おうきく");
    check("no user => shared tokens", surfaces(anon!.lines[0]!.tokens) === surfaces(line0Tokens));

    // --- 4. Review queue ---
    console.log("4. Review queue");
    const qA = await getReviewQueue(db, userA.id);
    const qB = await getReviewQueue(db, userB.id);
    const qa0 = qA.cards.find((c) => c.cardId === cardA0);
    const qb0 = qB.cards.find((c) => c.cardId === cardB0);
    check("A's card has the corrected tokens", !!qa0 && surfaces(qa0.tokens) === "マーク|さん|は|10分|待つ", qa0?.tokens);
    check("A's queue includes the corrected entry", Boolean(qA.wordEntries[mark!.id]));
    check("B's card has the shared tokens", !!qb0 && surfaces(qb0.tokens) === surfaces(line0Tokens), qb0?.tokens);
    check("B's queue lacks マーク", !qB.wordEntries[mark!.id]);

    // --- 5. Curation screen ---
    console.log("5. Curation page");
    const curA = await listUncuratedCards(db, userA.id);
    const curB = await listUncuratedCards(db, userB.id);
    const ca1 = curA.items.find((c) => c.cardId === cardA1);
    const cb1 = curB.items.find((c) => c.cardId === cardB1);
    check("A's curation card shows おおきく + spans", ca1?.tokens[0]?.reading === "おおきく" && ca1.tokenSpans?.[0]?.corrected === true, ca1);
    check("B's curation card shows おうきく", cb1?.tokens[0]?.reading === "おうきく" && !cb1.tokenSpans, cb1);

    // --- 6. Lapis export ---
    console.log("6. Lapis export");
    const opts = { deck: "Fuchine", history: false };
    const exA = await getLapisExport(db, userA.id, "all");
    const exB = await getLapisExport(db, userB.id, "all");
    const tsvA = buildLapisTsv(exA.cards, exA.entries, opts);
    const tsvB = buildLapisTsv(exB.cards, exB.entries, opts);
    const a0 = lapisRow(tsvA, cardA0);
    const a1 = lapisRow(tsvA, cardA1);
    const b0 = lapisRow(tsvB, cardB0);
    const b1 = lapisRow(tsvB, cardB1);
    check("A: target word is the corrected マーク", a0("Expression") === "マーク", a0("Expression"));
    check("A: sentence bolds マーク", a0("Sentence") === "<b>マーク</b>さんは10分待つ", a0("Sentence"));
    check("A: 10分 furigana じゅっぷん", a0("SentenceFurigana").includes("10 分[じゅっぷん]") || a0("SentenceFurigana").includes("10分[じゅっぷん]"), a0("SentenceFurigana"));
    check("A: 大きく furigana おおきく", a1("SentenceFurigana").includes("大[おお]きく"), a1("SentenceFurigana"));
    check("B: target is not マーク", b0("Expression") !== "マーク", b0("Expression"));
    check("B: 大きく furigana おうきく", b1("SentenceFurigana").includes("大[おう]きく"), b1("SentenceFurigana"));

    // --- 7. Stats follow the corrected entry ---
    console.log("7. Word stats");
    const reviewed = await reviewCardById(db, userA.id, cardA0, GRADE.Good);
    check("review => 200", reviewed.status === 200, reviewed);
    const prog = await recordProgress(db, userA.id, video.id, { msWatched: 1000, lineIds: [line0!.id] });
    check("progress => 200", prog.status === 200, prog);
    const [statA] = await db.select().from(userWordStats)
      .where(and(eq(userWordStats.userId, userA.id), eq(userWordStats.wordEntryId, mark!.id)));
    check("A's review + view land on マーク", statA?.reviewsTotal === 1 && statA.reviewsOk === 1 && statA.views === 1, statA);
    await reviewCardById(db, userB.id, cardB0, GRADE.Good);
    const [statB] = await db.select().from(userWordStats)
      .where(and(eq(userWordStats.userId, userB.id), eq(userWordStats.wordEntryId, mark!.id)));
    check("B's review does not touch マーク", !statB, statB);

    // --- 8. Reset ---
    console.log("8. Reset");
    const resetSpan = await deleteTokenOverrides(db, userA.id, line0!.id, { startIdx: 4 });
    check("reset span => 10分 back to 1|0分, マーク kept",
      resetSpan.status === 200 && surfaces(resetSpan.body.tokens as Token[]) === "マーク|さん|は|1|0分|待つ", resetSpan.body.tokens);
    const noop = await putTokenOverride(db, userA.id, line0!.id, { startIdx: 0, endIdx: 1, tokens: [
      { surface: "マー", reading: "まー", pos: "名詞", wordEntryId: null }, { surface: "ク", reading: "く", pos: "名詞", wordEntryId: null },
    ] });
    check("saving the original tokens = reset", noop.status === 200 && surfaces(noop.body.tokens as Token[]) === surfaces(line0Tokens)
      && noop.body.tokenSpans === null, noop.body);
    await putTokenOverride(db, userA.id, line0!.id, { startIdx: 0, endIdx: 1, tokens: [{ surface: "マーク" }] });
    const resetAll = await deleteTokenOverrides(db, userA.id, line0!.id, {});
    check("reset whole line => shared tokens", resetAll.status === 200 && surfaces(resetAll.body.tokens as Token[]) === surfaces(line0Tokens));
    const badReset = await deleteTokenOverrides(db, userA.id, line0!.id, { startIdx: "x" });
    check("reset with a bad span => 400", badReset.status === 400, badReset);
    const left = await db.select().from(tokenOverrides).where(eq(tokenOverrides.userId, userA.id));
    check("only line 1's correction remains", left.length === 1 && left[0]!.subtitleLineId === line1!.id, left);

    // --- 9. Cascades ---
    console.log("9. Cascades");
    await putTokenOverride(db, userB.id, line0!.id, { startIdx: 0, endIdx: 1, tokens: [{ surface: "マーク" }] });
    await db.delete(subtitleLines).where(eq(subtitleLines.id, line1!.id));
    const afterLine = await db.select().from(tokenOverrides).where(eq(tokenOverrides.subtitleLineId, line1!.id));
    check("line delete cascades its corrections", afterLine.length === 0, afterLine);
    await db.delete(users).where(eq(users.id, userB.id));
    const afterUser = await db.select().from(tokenOverrides).where(eq(tokenOverrides.userId, userB.id));
    check("user delete cascades their corrections", afterUser.length === 0, afterUser);
  } finally {
    await db.delete(videos).where(eq(videos.id, video.id));
    await db.delete(users).where(inArray(users.id, [userA.id, userB.id]));
    await db.delete(wordEntries).where(eq(wordEntries.language, lang));
    if (insertedMark) await db.delete(wordEntries).where(eq(wordEntries.id, insertedMark.id));
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
