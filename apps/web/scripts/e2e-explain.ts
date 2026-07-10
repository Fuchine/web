/**
 * End-to-end test for the layer-2 explanation cache (F1, T1.5).
 *
 * Validates the locked invariant (CLAUDE.md / CONTRATO_IA §5): the shared,
 * versioned cache keyed by
 *   (subtitle_line_id, kind, explanation_language, prompt_version).
 *
 * Two layers, real DB, no DB mocks:
 *  - `explainLineCached` / `getCachedExplanation` (@fuchine/llm) driven by a
 *    call-counting fake provider — proves miss→generate→hit and that language
 *    + prompt_version + force change the cache decision.
 *  - the web lib `explainLine` (apps/web/lib/explain.ts) — proves cache-first
 *    serves WITHOUT a provider, and that a miss with no key degrades to 502.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-explain.ts
 */
import { eq } from "drizzle-orm";
import {
  createDb,
  users,
  videos,
  subtitleLines,
  aiExplanations,
  ensureUserSettings,
  type Database,
  type Explanation,
} from "@fuchine/db";
import {
  explainLineCached,
  getCachedExplanation,
  PROMPT_VERSION,
  type LlmProvider,
  type SubtitleLineCtx,
} from "@fuchine/llm";
import { explainLine } from "../lib/explain";

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

/** Counts calls so we can prove the cache short-circuits the provider. */
class CountingProvider implements LlmProvider {
  readonly name = "counting";
  calls = 0;
  async translateBatch(lines: string[]): Promise<(string | null)[]> {
    return lines.map(() => null);
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async explainLine(_ctx: SubtitleLineCtx, opts: { explanationLanguage: string }): Promise<Explanation> {
    this.calls++;
    return {
      breakdown: [{ surface: "猫", tag: "noun", gloss: `cat#${this.calls}`, note: `lang=${opts.explanationLanguage}` }],
      plainTerms: `generated #${this.calls}`,
    };
  }
}

/** Like CountingProvider but slow, so a concurrent second caller is still
 *  inside the single-flight window (blocked on the advisory lock) when the
 *  first generates — deterministically exercising the lock path. */
class SlowCountingProvider implements LlmProvider {
  readonly name = "slow-counting";
  calls = 0;
  constructor(private readonly delayMs = 300) {}
  async translateBatch(lines: string[]): Promise<(string | null)[]> {
    return lines.map(() => null);
  }
  async explainLine(): Promise<Explanation> {
    this.calls++;
    await new Promise((r) => setTimeout(r, this.delayMs));
    return { breakdown: [], plainTerms: `slow #${this.calls}` };
  }
}

async function main() {
  console.log("\n=== E2E: explanation cache ===\n");

  const [user] = await db.insert(users).values({ email: `e2e-explain-${Date.now()}@example.com` }).returning();
  await ensureUserSettings(db, user.id); // defaults: explanationLanguage = "en"

  const [video] = await db
    .insert(videos)
    .values({ source: "youtube", sourceId: `e2e-exp-${Date.now()}`, url: "https://youtu.be/e2e", title: "exp", language: "ja", status: "done" })
    .returning();
  const [line] = await db
    .insert(subtitleLines)
    .values({ videoId: video.id, idx: 0, tStartMs: 0, tEndMs: 1000, textOriginal: "猫が好き", tokens: [] })
    .returning();

  // ---------- A. cache primitive (explainLineCached) ----------
  console.log("A. explainLineCached (versioned shared cache)");
  const p = new CountingProvider();
  const ctx: SubtitleLineCtx = { text: "猫が好き", prevText: null, nextText: null, tokens: [], learningLanguage: "ja" };

  const first = await explainLineCached(db, p, line.id, ctx, { explanationLanguage: "en" });
  check("miss generates (provider called once)", p.calls === 1, p.calls);
  check("returns the generated content", first.plainTerms === "generated #1", first.plainTerms);

  const second = await explainLineCached(db, p, line.id, ctx, { explanationLanguage: "en" });
  check("hit does NOT call provider again", p.calls === 1, p.calls);
  check("hit returns the cached content", second.plainTerms === "generated #1", second.plainTerms);

  const otherLang = await explainLineCached(db, p, line.id, ctx, { explanationLanguage: "pt" });
  check("different explanation_language is a separate key (miss)", p.calls === 2, p.calls);
  check("pt content distinct", otherLang.plainTerms === "generated #2", otherLang.plainTerms);

  const forced = await explainLineCached(db, p, line.id, ctx, { explanationLanguage: "en", force: true });
  check("force bypasses cache (regenerates)", p.calls === 3, p.calls);
  check("forced result overwrites the en cache", forced.plainTerms === "generated #3", forced.plainTerms);

  const enHitAfterForce = await getCachedExplanation(db, {
    subtitleLineId: line.id, kind: "line", explanationLanguage: "en", promptVersion: PROMPT_VERSION,
  });
  check("en cache now holds the forced content", enHitAfterForce?.plainTerms === "generated #3", enHitAfterForce?.plainTerms);

  const wrongVersion = await getCachedExplanation(db, {
    subtitleLineId: line.id, kind: "line", explanationLanguage: "en", promptVersion: PROMPT_VERSION + 1,
  });
  check("bumping prompt_version misses (cache is versioned)", wrongVersion === null, wrongVersion);

  const rows = await db.select().from(aiExplanations).where(eq(aiExplanations.subtitleLineId, line.id));
  check("exactly 2 cache rows (en + pt), not 4", rows.length === 2, rows.length);

  // ---------- C. single-flight: concurrent misses generate once ----------
  console.log("C. single-flight (concurrent misses → one provider call)");
  const [line3] = await db
    .insert(subtitleLines)
    .values({ videoId: video.id, idx: 2, tStartMs: 2000, tEndMs: 3000, textOriginal: "鳥も好き", tokens: [] })
    .returning();
  const sp = new SlowCountingProvider();
  const [r1, r2] = await Promise.all([
    explainLineCached(db, sp, line3.id, ctx, { explanationLanguage: "en" }),
    explainLineCached(db, sp, line3.id, ctx, { explanationLanguage: "en" }),
  ]);
  check("two concurrent misses call the provider exactly once", sp.calls === 1, sp.calls);
  check("both callers get the same content", r1.plainTerms === r2.plainTerms && r1.plainTerms === "slow #1", [r1.plainTerms, r2.plainTerms]);
  const line3Rows = await db.select().from(aiExplanations).where(eq(aiExplanations.subtitleLineId, line3.id));
  check("exactly one cache row for the line", line3Rows.length === 1, line3Rows.length);

  // ---------- B. web lib explainLine ----------
  console.log("B. explainLine (lib: cache-first + degrade)");

  // The user's explanationLanguage is "en", which is already cached above →
  // must serve from cache WITHOUT a provider (no BYOK key supplied).
  const served = await explainLine(db, user.id, line.id, { encryptionKey: "" });
  check("cache hit => 200", served.status === 200, served);
  check("cache hit marked cached:true", served.body.cached === true, served.body.cached);

  // A fresh line with no cache + no BYOK + house provider = echo (default env)
  // → echo throws → degrade to 502, never a 500.
  const [line2] = await db
    .insert(subtitleLines)
    .values({ videoId: video.id, idx: 1, tStartMs: 1000, tEndMs: 2000, textOriginal: "犬も好き", tokens: [] })
    .returning();
  const degraded = await explainLine(db, user.id, line2.id, { encryptionKey: "" });
  check("miss with no key => 502 (degrades, no crash)", degraded.status === 502, degraded);

  // Unknown line => 404.
  const missing = await explainLine(db, user.id, "00000000-0000-0000-0000-000000000000", { encryptionKey: "" });
  check("unknown line => 404", missing.status === 404, missing);

  // ---------- Cleanup ----------
  await db.delete(users).where(eq(users.id, user.id)); // cascades settings
  await db.delete(videos).where(eq(videos.id, video.id)); // cascades lines + explanations

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
