/**
 * End-to-end test for the import pipeline (T0.7).
 *
 * Drives the REAL functions with no mocks: the web producer
 * (`createImport`, apps/web/lib/import.ts) registers a video + captions and
 * enqueues a job; the worker (`importVideo`, apps/worker/src/pipeline.ts)
 * consumes it and enriches the lines with layer-0 tokens (kuromoji) + the
 * dictionary. Redis is swapped for an in-memory queue so this runs anywhere.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-import.ts
 */
import { eq } from "drizzle-orm";
import {
  createDb,
  videos,
  subtitleLines,
  wordEntries,
  type Database,
  type Token,
  type Definition,
} from "@fuchine/db";
import { createImport, type ImportEnqueuer } from "../lib/import";
import { importVideo } from "../../worker/src/pipeline";

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

/** In-memory stand-in for the BullMQ producer — collects jobs we then run. */
class MemoryQueue implements ImportEnqueuer {
  jobs: { videoId: string }[] = [];
  async add(_name: string, data: { videoId: string }) {
    this.jobs.push(data);
  }
}

async function main() {
  console.log("\n=== E2E: import pipeline ===\n");
  const videoId = `e2e-import-${Date.now()}`;
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const queue = new MemoryQueue();

  // Seed two dictionary entries so layer-0 can resolve wordEntryId end-to-end.
  const defs: Definition[] = [{ glosses: ["cat"], partsOfSpeech: ["n"] }];
  await db
    .insert(wordEntries)
    .values([
      { language: "ja", lemma: "猫", reading: "ネコ", pos: "noun", definitions: defs },
      { language: "ja", lemma: "好き", reading: "スキ", pos: "adj", definitions: [{ glosses: ["liked"], partsOfSpeech: ["adj-na"] }] },
    ])
    .onConflictDoNothing();

  // --- 1. Validation ---
  console.log("1. Validation");
  check("missing url => 400", (await createImport(db, queue, {})).status === 400);
  check("invalid url => 400", (await createImport(db, queue, { url: "https://example.com/x" })).status === 400);
  check(
    "no captions => 422",
    (await createImport(db, queue, { url: watchUrl, captions: [] })).status === 422,
  );
  check("nothing enqueued yet", queue.jobs.length === 0, queue.jobs.length);

  // --- 2. Register a new video with captions ---
  console.log("2. Register");
  const captions = [
    { startMs: 0, endMs: 1500, text: "猫が好き" },
    { startMs: 1500, endMs: 3000, text: "犬も好き" },
    { startMs: 3000, endMs: 4200, text: "   " }, // blank: must be dropped
  ];
  const reg = await createImport(db, queue, {
    url: watchUrl,
    title: "E2E import",
    channel: "tester",
    captions,
  });
  check("register => 201", reg.status === 201, reg);
  check("status pending", reg.body.status === "pending", reg.body.status);
  check("blank caption dropped (2 lines)", reg.body.lines === 2, reg.body.lines);
  check("job enqueued", queue.jobs.length === 1, queue.jobs.length);
  const newVideoId = reg.body.videoId as string;
  check("job targets the new video", queue.jobs[0]?.videoId === newVideoId);

  // --- 3. Dedup: same URL before processing => shared cache hit, not cached-done ---
  console.log("3. Dedup (pre-processing)");
  const dup = await createImport(db, queue, { url: watchUrl, captions });
  check("dedup => 200", dup.status === 200, dup);
  check("same videoId", dup.body.videoId === newVideoId);
  check("cached:false while pending", dup.body.cached === false, dup.body.cached);
  check("no extra job enqueued", queue.jobs.length === 1, queue.jobs.length);

  // --- 4. Worker consumes the job: layer-0 enrichment ---
  console.log("4. Worker enrichment");
  await importVideo(db, queue.jobs[0]!);

  const [video] = await db.select().from(videos).where(eq(videos.id, newVideoId));
  check("video marked done", video?.status === "done", video?.status);

  const lines = await db
    .select()
    .from(subtitleLines)
    .where(eq(subtitleLines.videoId, newVideoId))
    .orderBy(subtitleLines.idx);
  check("two lines persisted, ordered", lines.length === 2 && lines[0]!.idx === 0 && lines[1]!.idx === 1, lines.map((l) => l.idx));
  check("first line text intact", lines[0]?.textOriginal === "猫が好き", lines[0]?.textOriginal);

  const toks0 = (lines[0]?.tokens as Token[]) ?? [];
  check("layer-0 tokenized line 1", toks0.length > 0, toks0.length);
  check("kuromoji surfaces present", toks0.every((t) => typeof t.surface === "string" && t.surface.length > 0));
  const neko = toks0.find((t) => t.lemma === "猫");
  check("dictionary resolved 猫 => wordEntryId", !!neko?.wordEntryId, neko);

  // --- 5. Re-import after done => cached:true ---
  console.log("5. Dedup (post-processing)");
  const cached = await createImport(db, queue, { url: watchUrl, captions });
  check("re-import => 200", cached.status === 200, cached);
  check("cached:true once done", cached.body.cached === true, cached.body.cached);

  // --- 6. Idempotent worker re-run (jobs can be retried) ---
  console.log("6. Worker idempotency");
  await importVideo(db, queue.jobs[0]!);
  const linesAgain = await db.select().from(subtitleLines).where(eq(subtitleLines.videoId, newVideoId));
  check("still two lines after re-run", linesAgain.length === 2, linesAgain.length);

  // --- Cleanup ---
  await db.delete(videos).where(eq(videos.id, newVideoId)); // cascades to subtitle_lines
  await db.delete(wordEntries).where(eq(wordEntries.lemma, "猫"));
  await db.delete(wordEntries).where(eq(wordEntries.lemma, "好き"));

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
