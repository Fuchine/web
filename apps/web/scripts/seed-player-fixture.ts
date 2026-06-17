// Test fixture: inserts a single video directly with status=done and a few
// subtitle lines, bypassing the worker/import flow. Lets the user hit
// /videos/[id] in the dev server without the browser extension or YouTube API.
//
// Usage:  pnpm --filter @fuchine/web exec tsx scripts/seed-player-fixture.ts
// Prints the resulting videoId at the end.

import * as path from "node:path";
import { config } from "dotenv";
config({ path: path.resolve(process.cwd(), "..", "..", ".env") });

// Imports below MUST be dynamic: `db` reads DATABASE_URL at module-init time,
// which has to happen after dotenv runs.
const { db } = await import("../lib/db");
const { videos, subtitleLines } = await import("@fuchine/db");
import type { Token } from "@fuchine/db";

const VIDEO_ID = "dQw4w9WgXcQ"; // Rick Astley — public, well-known, works for sync test

const LINES: Array<{ idx: number; tStartMs: number; tEndMs: number; textOriginal: string; textTranslation: string | null; tokens: Token[] }> = [
  {
    idx: 0, tStartMs: 0, tEndMs: 4000,
    textOriginal: "おはようございます。",
    textTranslation: "Good morning.",
    tokens: [
      { surface: "おはよう", lemma: "おはよう", reading: "おはよう", pos: "Interjection", wordEntryId: null },
      { surface: "ございます", lemma: "ございます", reading: "ございます", pos: "Aux", wordEntryId: null },
      { surface: "。", lemma: "。", reading: null, pos: "Punct", wordEntryId: null },
    ],
  },
  {
    idx: 1, tStartMs: 5000, tEndMs: 10000,
    textOriginal: "今日は京都の鴨川に来ています。",
    textTranslation: "Today I'm here at the Kamo River in Kyoto.",
    tokens: [
      { surface: "今日", lemma: "今日", reading: "きょう", pos: "Noun", wordEntryId: null },
      { surface: "は", lemma: "は", reading: null, pos: "Particle", wordEntryId: null },
      { surface: "京都", lemma: "京都", reading: "きょうと", pos: "Noun", wordEntryId: null },
      { surface: "の", lemma: "の", reading: null, pos: "Particle", wordEntryId: null },
      { surface: "鴨川", lemma: "鴨川", reading: "かもがわ", pos: "Noun", wordEntryId: null },
      { surface: "に", lemma: "に", reading: null, pos: "Particle", wordEntryId: null },
      { surface: "来ています", lemma: "来る", reading: "きています", pos: "Verb", wordEntryId: null },
      { surface: "。", lemma: "。", reading: null, pos: "Punct", wordEntryId: null },
    ],
  },
  {
    idx: 2, tStartMs: 11000, tEndMs: 16000,
    textOriginal: "毎朝川沿いを歩いています。",
    textTranslation: "Every morning, I walk along the river.",
    tokens: [
      { surface: "毎朝", lemma: "毎朝", reading: "まいあさ", pos: "Noun", wordEntryId: null },
      { surface: "川沿い", lemma: "川沿い", reading: "かわぞい", pos: "Noun", wordEntryId: null },
      { surface: "を", lemma: "を", reading: null, pos: "Particle", wordEntryId: null },
      { surface: "歩いて", lemma: "歩く", reading: "あるいて", pos: "Verb", wordEntryId: null },
      { surface: "います", lemma: "いる", reading: "います", pos: "Aux", wordEntryId: null },
      { surface: "。", lemma: "。", reading: null, pos: "Punct", wordEntryId: null },
    ],
  },
  {
    idx: 3, tStartMs: 17000, tEndMs: 23000,
    textOriginal: "空気がとても澄んでいて、気持ちがいいですね。",
    textTranslation: "The air is so clear — it feels wonderful.",
    tokens: [
      { surface: "空気", lemma: "空気", reading: "くうき", pos: "Noun", wordEntryId: null },
      { surface: "が", lemma: "が", reading: null, pos: "Particle", wordEntryId: null },
      { surface: "とても", lemma: "とても", reading: "とても", pos: "Adverb", wordEntryId: null },
      { surface: "澄んで", lemma: "澄む", reading: "すんで", pos: "Verb", wordEntryId: null },
      { surface: "いて", lemma: "いる", reading: "いて", pos: "Aux", wordEntryId: null },
      { surface: "、", lemma: "、", reading: null, pos: "Punct", wordEntryId: null },
      { surface: "気持ち", lemma: "気持ち", reading: "きもち", pos: "Noun", wordEntryId: null },
      { surface: "が", lemma: "が", reading: null, pos: "Particle", wordEntryId: null },
      { surface: "いい", lemma: "いい", reading: "いい", pos: "Adj", wordEntryId: null },
      { surface: "です", lemma: "です", reading: "です", pos: "Aux", wordEntryId: null },
      { surface: "ね", lemma: "ね", reading: "ね", pos: "Particle", wordEntryId: null },
      { surface: "。", lemma: "。", reading: null, pos: "Punct", wordEntryId: null },
    ],
  },
  {
    idx: 4, tStartMs: 24000, tEndMs: 30000,
    textOriginal: "少し寒いですが、散歩には最適です。",
    textTranslation: "It's a bit cold, but it's perfect for a walk.",
    tokens: [
      { surface: "少し", lemma: "少し", reading: "すこし", pos: "Adverb", wordEntryId: null },
      { surface: "寒い", lemma: "寒い", reading: "さむい", pos: "Adj", wordEntryId: null },
      { surface: "です", lemma: "です", reading: "です", pos: "Aux", wordEntryId: null },
      { surface: "が", lemma: "が", reading: null, pos: "Particle", wordEntryId: null },
      { surface: "、", lemma: "、", reading: null, pos: "Punct", wordEntryId: null },
      { surface: "散歩", lemma: "散歩", reading: "さんぽ", pos: "Noun", wordEntryId: null },
      { surface: "に", lemma: "に", reading: null, pos: "Particle", wordEntryId: null },
      { surface: "は", lemma: "は", reading: null, pos: "Particle", wordEntryId: null },
      { surface: "最適", lemma: "最適", reading: "さいてき", pos: "Noun", wordEntryId: null },
      { surface: "です", lemma: "です", reading: "です", pos: "Aux", wordEntryId: null },
      { surface: "。", lemma: "。", reading: null, pos: "Punct", wordEntryId: null },
    ],
  },
  {
    idx: 5, tStartMs: 31000, tEndMs: 35000,
    textOriginal: "♪ BGM ♪",
    textTranslation: null,
    tokens: [],
  },
];

async function main() {
  const existing = await db.query.videos.findFirst({
    where: (v, { and, eq }) => and(eq(v.source, "youtube"), eq(v.sourceId, VIDEO_ID)),
  });

  if (existing) {
    console.log(`Video already exists: ${existing.id} (status=${existing.status})`);
    console.log(`Open: http://localhost:3001/videos/${existing.id}`);
    return;
  }

  const [video] = await db
    .insert(videos)
    .values({
      source: "youtube",
      sourceId: VIDEO_ID,
      url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      title: "京都の朝、静かな散歩 — A quiet morning walk in Kyoto",
      channel: "Kyoto Slow Living",
      durationS: 35,
      language: "ja",
      status: "done",
    })
    .returning();

  if (!video) throw new Error("Failed to insert video");

  await db
    .insert(subtitleLines)
    .values(LINES.map((l) => ({ ...l, videoId: video.id })));

  console.log(`Inserted video: ${video.id}`);
  console.log(`Open: http://localhost:3001/videos/${video.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
