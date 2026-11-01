/**
 * End-to-end test for the house-key spend ceiling (T2.4), real Postgres:
 * spend is read from llm_usage (house rows since local midnight), and once it
 * reaches the ceiling the house paths stop (explain without BYOK, chunk
 * translation, pre-warm) while cache hits and BYOK keep working. Also covers
 * HOUSE_EXPLAIN_FALLBACK=false (byok_required).
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-house-budget.ts
 */
import { eq, inArray } from "drizzle-orm";
import {
  createDb, ensureUserSettings, llmUsage, subtitleLines, subtitleTranslationChunks, users, videos,
  type Database, type Explanation,
} from "@fuchine/db";
import {
  createHouseBudget, explainLineCached, getHouseTokensToday, prewarmVideoExplanations,
  type LlmProvider, type UsageMeta,
} from "@fuchine/llm";
import { explainLine } from "../lib/explain";
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
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

const EXPLANATION: Explanation = { breakdown: [], plainTerms: "fake" };

/** Counts calls and records the usage meta it was given. */
function fakeProvider() {
  const seen: (UsageMeta | undefined)[] = [];
  const provider: LlmProvider = {
    async translateBatch(lines) { seen.push(undefined); return lines.map((l) => `EN:${l}`); },
    async explainLine(_ctx, opts) { seen.push(opts.meta); return EXPLANATION; },
  };
  return { provider, seen };
}

async function main() {
  const tag = `e2e-budget-${Date.now()}`;
  const [user] = await db.insert(users).values({ email: `${tag}@example.test` }).returning();
  await ensureUserSettings(db, user!.id);
  const [video] = await db
    .insert(videos)
    .values({ sourceId: tag.slice(-11), url: "https://www.youtube.com/watch?v=x", title: tag, status: "done" })
    .returning();
  const lines = await db
    .insert(subtitleLines)
    .values([0, 1, 2, 3].map((idx) => ({ videoId: video!.id, idx, tStartMs: idx * 1000, tEndMs: idx * 1000 + 900, textOriginal: `行${idx}です` })))
    .returning();
  const [l0, l1, l2] = lines.sort((a, b) => a.idx - b.idx);

  try {
    console.log("accounting");
    const base = await getHouseTokensToday(db);
    const yesterday = new Date(Date.now() - 36 * 3_600_000);
    await db.insert(llmUsage).values([
      { videoId: video!.id, fn: "explainLine", provider: "e2e", inTokens: 600, outTokens: 400, ms: 1, ok: true },
      { videoId: video!.id, fn: "translateBatch", provider: "e2e", inTokens: 100, outTokens: null, ms: 1, ok: false },
      { videoId: video!.id, fn: "explainLine", provider: "e2e", inTokens: 9_000, outTokens: 9_000, ms: 1, ok: true, keySource: "byok" },
      { videoId: video!.id, fn: "explainLine", provider: "e2e", inTokens: 9_000, outTokens: 9_000, ms: 1, ok: true, createdAt: yesterday },
    ]);
    const today = (await getHouseTokensToday(db)) - base;
    check("house spend today = house rows since midnight (BYOK and yesterday excluded; null tokens = 0)", today === 1_100, today);

    const used = base + 1_100;
    const exhausted = createHouseBudget(db, { getLimit: () => used, ttlMs: 0 });
    const roomy = createHouseBudget(db, { getLimit: () => used + 1_000_000, ttlMs: 0 });
    check("budget reads exhausted at the ceiling", (await exhausted.state()) === "exhausted");
    check("budget reads ok below the ceiling", (await roomy.state()) === "ok");

    console.log("explain");
    const warm = fakeProvider();
    await explainLineCached(db, warm.provider, l1!.id, { text: l1!.textOriginal, prevText: null, nextText: null, tokens: [], learningLanguage: "ja" }, { explanationLanguage: "en" });

    const noByok = async () => { throw new (await import("@fuchine/llm")).MissingApiKeyError("none"); };
    const r429 = await explainLine(db, user!.id, l0!.id, { resolveByok: noByok, houseBudget: exhausted, explainFallback: true });
    check("no BYOK + budget spent → 429 house_budget", r429.status === 429 && r429.body.code === "house_budget", r429);
    check("429 carries a Retry-After until midnight", typeof r429.body.retryAfterSeconds === "number" && (r429.body.retryAfterSeconds as number) > 0);

    const hit = await explainLine(db, user!.id, l1!.id, { resolveByok: noByok, houseBudget: exhausted, explainFallback: true });
    check("cache hit still serves when the budget is spent", hit.status === 200 && hit.body.cached === true, hit.status);

    const byok = fakeProvider();
    const rByok = await explainLine(db, user!.id, l2!.id, {
      resolveByok: async () => byok.provider, houseBudget: exhausted, explainFallback: true,
    });
    check("BYOK explain ignores the house budget", rByok.status === 200 && byok.seen.length === 1, rByok.status);
    check("BYOK calls are marked key_source=byok", byok.seen[0]?.keySource === "byok", byok.seen[0]);

    const r403 = await explainLine(db, user!.id, l0!.id, { resolveByok: noByok, houseBudget: roomy, explainFallback: false });
    check("fallback off + no BYOK → 403 byok_required", r403.status === 403 && r403.body.code === "byok_required", r403);
    const hit2 = await explainLine(db, user!.id, l1!.id, { resolveByok: noByok, houseBudget: roomy, explainFallback: false });
    check("fallback off still serves cache hits", hit2.status === 200 && hit2.body.cached === true);

    const rOk = await explainLine(db, user!.id, l0!.id, { resolveByok: noByok, houseBudget: roomy, explainFallback: true });
    check("below the ceiling the house path runs (echo provider → degrades to 502, not 429)", rOk.status === 502, rOk.status);

    console.log("translate");
    const mt = fakeProvider();
    const t429 = await translateChunk(db, video!.id, 0, { provider: mt.provider, houseBudget: exhausted });
    check("translate miss with budget spent → 429 house_budget, provider not called",
      t429.status === 429 && t429.body.code === "house_budget" && mt.seen.length === 0, t429);
    const claims = await db.select().from(subtitleTranslationChunks).where(eq(subtitleTranslationChunks.videoId, video!.id));
    check("refused translate leaves no pending claim", claims.length === 0, claims);
    const tOk = await translateChunk(db, video!.id, 0, { provider: mt.provider, houseBudget: roomy });
    check("translate below the ceiling succeeds", tOk.status === 200 && tOk.body.cached === false && mt.seen.length === 1, tOk.status);
    const tHit = await translateChunk(db, video!.id, 0, { provider: mt.provider, houseBudget: exhausted });
    check("cached chunk still serves when the budget is spent", tHit.status === 200 && tHit.body.cached === true, tHit.status);

    console.log("pre-warm");
    const pw = fakeProvider();
    let allowed = 1;
    const summary = await prewarmVideoExplanations(db, pw.provider, video!.id, {
      explanationLanguage: "en",
      concurrency: 1,
      shouldContinue: async () => allowed-- > 0,
    });
    check("pre-warm stops when shouldContinue says no", summary.stopped && summary.generated === 1 && pw.seen.length === 1, summary);
    check("stopped lines are skipped, not failed", summary.skipped >= 1 && summary.failed === 0, summary);
    check("pre-warm calls are marked key_source=house", pw.seen[0]?.keySource === "house", pw.seen[0]);
  } finally {
    await db.delete(llmUsage).where(eq(llmUsage.videoId, video!.id));
    await db.delete(videos).where(inArray(videos.id, [video!.id]));
    await db.delete(users).where(eq(users.id, user!.id));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
