/**
 * End-to-end test for layer-1 lazy translation (translate one chunk on demand).
 *
 * Drives the REAL `translateChunk` (apps/web/lib/translate.ts) over a live
 * Postgres with an injected, call-counting provider (no house key needed).
 * Verifies: miss translates + persists + marks the chunk, hit serves cached
 * with zero provider calls, empty chunk / unknown video edge cases, and that a
 * provider failure returns 502 WITHOUT a chunk marker (so it can retry).
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-translate.ts
 */
import { and, asc, eq } from "drizzle-orm";
import {
  createDb,
  videos,
  subtitleLines,
  subtitleTranslationChunks,
  type Database,
} from "@fuchine/db";
import { lineRangeForChunk } from "@fuchine/core";
import type { LlmProvider, SubtitleLineCtx } from "@fuchine/llm";
import type { Explanation } from "@fuchine/db";
import { translateChunk } from "../lib/translate";

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

/** Echoes "EN:<line>" and counts calls. */
class CountingProvider implements LlmProvider {
  readonly name = "counting";
  calls = 0;
  // eslint-disable-next-line @typescript-eslint/require-await
  async translateBatch(lines: string[]): Promise<(string | null)[]> {
    this.calls++;
    return lines.map((l) => `EN:${l}`);
  }
  async explainLine(_ctx: SubtitleLineCtx): Promise<Explanation> {
    throw new Error("not used");
  }
}

/** Always returns nulls — simulates a provider outage. */
class FailingProvider implements LlmProvider {
  readonly name = "failing";
  // eslint-disable-next-line @typescript-eslint/require-await
  async translateBatch(lines: string[]): Promise<(string | null)[]> {
    return lines.map(() => null);
  }
  async explainLine(): Promise<Explanation> {
    throw new Error("not used");
  }
}

function markerCount(videoId: string, chunkIdx: number) {
  return db
    .select({ chunkIdx: subtitleTranslationChunks.chunkIdx })
    .from(subtitleTranslationChunks)
    .where(and(eq(subtitleTranslationChunks.videoId, videoId), eq(subtitleTranslationChunks.chunkIdx, chunkIdx)));
}

async function main() {
  console.log("\n=== E2E: lazy chunk translation ===\n");

  const [video] = await db
    .insert(videos)
    .values({ source: "youtube", sourceId: `e2e-tr-${Date.now()}`, url: "https://youtu.be/tr", title: "tr", language: "ja", status: "done" })
    .returning();

  // Chunk 0: three lines (idx 0..2). Chunk 1 will be the failure case.
  await db.insert(subtitleLines).values([
    { videoId: video.id, idx: 0, tStartMs: 0, tEndMs: 1000, textOriginal: "猫が好き", tokens: [] },
    { videoId: video.id, idx: 1, tStartMs: 1000, tEndMs: 2000, textOriginal: "犬も好き", tokens: [] },
    { videoId: video.id, idx: 2, tStartMs: 2000, tEndMs: 3000, textOriginal: "鳥も好き", tokens: [] },
  ]);
  const { startIdx } = lineRangeForChunk(1); // first idx of chunk 1
  await db.insert(subtitleLines).values({ videoId: video.id, idx: startIdx, tStartMs: 60000, tEndMs: 61000, textOriginal: "魚が好き", tokens: [] });

  // A line each in chunks 2/3/4 for the concurrency + claim-sweep cases below.
  for (const c of [2, 3, 4]) {
    const { startIdx: s } = lineRangeForChunk(c);
    await db.insert(subtitleLines).values({ videoId: video.id, idx: s, tStartMs: c * 60000, tEndMs: c * 60000 + 1000, textOriginal: `chunk${c}好き`, tokens: [] });
  }

  // --- 1. Miss → translate + persist + mark ---
  console.log("1. Miss");
  const cp = new CountingProvider();
  const first = await translateChunk(db, video.id, 0, { provider: cp });
  check("translate => 200", first.status === 200, first);
  check("provider called once", cp.calls === 1, cp.calls);
  check("not cached", first.body.cached === false, first.body.cached);
  check("returns translations", first.body.lines?.[0]?.textTranslation === "EN:猫が好き", first.body.lines);

  const persisted = await db
    .select({ textTranslation: subtitleLines.textTranslation })
    .from(subtitleLines)
    .where(eq(subtitleLines.videoId, video.id))
    .orderBy(asc(subtitleLines.idx));
  check("translations persisted to lines", persisted[1]?.textTranslation === "EN:犬も好き", persisted[1]);
  check("chunk 0 marker written", (await markerCount(video.id, 0)).length === 1);

  // --- 2. Hit → cached, zero provider calls ---
  console.log("2. Hit");
  const second = await translateChunk(db, video.id, 0, { provider: cp });
  check("cached => 200", second.status === 200, second);
  check("cached:true", second.body.cached === true, second.body.cached);
  check("provider NOT called again", cp.calls === 1, cp.calls);
  check("serves stored translations", second.body.lines?.[0]?.textTranslation === "EN:猫が好き");

  // --- 3. Empty chunk (no lines in range) ---
  console.log("3. Empty chunk");
  const empty = await translateChunk(db, video.id, 99, { provider: cp });
  check("empty range => 200 cached, no lines", empty.status === 200 && empty.body.cached === true && empty.body.lines?.length === 0, empty.body);
  check("provider still not called", cp.calls === 1, cp.calls);

  // --- 4. Unknown video ---
  console.log("4. Unknown video");
  const noVid = await translateChunk(db, "00000000-0000-0000-0000-000000000000", 0, { provider: cp });
  check("unknown video => 404", noVid.status === 404, noVid);

  // --- 5. Provider failure → 502, no marker (retryable) ---
  console.log("5. Failure degrades");
  const fail = await translateChunk(db, video.id, 1, { provider: new FailingProvider() });
  check("all-null on real text => 502", fail.status === 502, fail);
  check("no marker written for chunk 1 (retryable)", (await markerCount(video.id, 1)).length === 0);
  const failLine = await db
    .select({ textTranslation: subtitleLines.textTranslation })
    .from(subtitleLines)
    .where(and(eq(subtitleLines.videoId, video.id), eq(subtitleLines.idx, startIdx)));
  check("failed line left untranslated", failLine[0]?.textTranslation === null, failLine[0]);

  // Retry chunk 1 with a working provider now succeeds.
  const retry = await translateChunk(db, video.id, 1, { provider: new CountingProvider() });
  check("retry after failure => 200 + marker", retry.status === 200 && (await markerCount(video.id, 1)).length === 1, retry.status);

  // --- 6. Concurrent claim: two requests, one paid MT call ---
  console.log("6. Concurrent claim");
  const shared = new CountingProvider();
  const [a, b] = await Promise.all([
    translateChunk(db, video.id, 2, { provider: shared }),
    translateChunk(db, video.id, 2, { provider: shared }),
  ]);
  check("only one paid MT call for the shared chunk", shared.calls === 1, shared.calls);
  // Timing-independent invariant: exactly one request paid for a fresh translate;
  // the other deferred — either 202 pending (lost the claim) or 200 cached (the
  // winner finished first). Never two fresh translates.
  const responses = [a, b];
  const fresh = responses.filter((r) => r.status === 200 && r.body.cached === false);
  const deferred = responses.filter((r) => r.status === 202 || (r.status === 200 && r.body.cached === true));
  check("exactly one paid translate, the other deferred to cache/pending", fresh.length === 1 && deferred.length === 1, [a.status, b.status]);
  check("chunk 2 marked done", (await markerCount(video.id, 2)).length === 1);
  const after = await translateChunk(db, video.id, 2, { provider: shared });
  check("subsequent fetch serves cached, no extra call", after.status === 200 && after.body.cached === true && shared.calls === 1, { s: after.status, c: shared.calls });

  // --- 7. Fresh 'pending' claim → 202 (someone else is translating) ---
  console.log("7. Fresh pending → 202");
  await db.insert(subtitleTranslationChunks).values({ videoId: video.id, chunkIdx: 3, status: "pending" });
  const held = new CountingProvider();
  const pending = await translateChunk(db, video.id, 3, { provider: held });
  check("held chunk => 202 pending", pending.status === 202 && pending.body.pending === true, pending);
  check("provider not called while held", held.calls === 0, held.calls);

  // --- 8. Stale 'pending' claim is swept, then translated ---
  console.log("8. Stale pending is swept");
  await db.insert(subtitleTranslationChunks).values({
    videoId: video.id, chunkIdx: 4, status: "pending",
    createdAt: new Date(Date.now() - 3 * 60_000), // 3 min old — past the 2-min window
  });
  const swept = new CountingProvider();
  const revived = await translateChunk(db, video.id, 4, { provider: swept });
  check("stale claim swept → translates => 200", revived.status === 200, revived);
  check("provider called once after sweep", swept.calls === 1, swept.calls);
  const [m4] = await db
    .select({ status: subtitleTranslationChunks.status })
    .from(subtitleTranslationChunks)
    .where(and(eq(subtitleTranslationChunks.videoId, video.id), eq(subtitleTranslationChunks.chunkIdx, 4)));
  check("chunk 4 marker flipped to done", m4?.status === "done", m4);

  // --- Cleanup ---
  await db.delete(videos).where(eq(videos.id, video.id)); // cascades lines + chunks

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
