/**
 * End-to-end test for account deletion. Runs the REAL deleteAccount lib against
 * a live Postgres and proves the schema cascade: every per-user row is removed
 * and shared content (video + subtitle line) survives. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-account.ts
 */
import {
  createDb, ensureUserSettings,
  users, userSettings, sessions, videos, subtitleLines, albums,
  sentenceCards, reviewLogs,
  type Database,
} from "@fuchine/db";
import { eq } from "drizzle-orm";
import { deleteAccount } from "../lib/account";

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

async function main() {
  console.log("\n=== E2E: account deletion ===\n");
  const stamp = Date.now();
  const email = `e2e-account-${stamp}@example.com`;

  const [user] = await db.insert(users).values({ email }).returning();
  await ensureUserSettings(db, user.id);
  await db.insert(sessions).values({
    sessionToken: `e2e-account-${stamp}`, userId: user.id,
    expires: new Date(Date.now() + 86_400_000),
  });

  const [video] = await db.insert(videos).values({
    sourceId: `e2e-account-${stamp}`, url: "https://youtube.com/watch?v=e2eacc", title: "E2E account",
  }).returning();
  const [line] = await db.insert(subtitleLines).values({
    videoId: video.id, idx: 0, tStartMs: 0, tEndMs: 2000, textOriginal: "テスト", tokens: [],
  }).returning();

  await db.insert(albums).values({ userId: user.id, name: "My album" });
  const [card] = await db.insert(sentenceCards).values({
    userId: user.id, subtitleLineId: line.id, videoId: video.id,
  }).returning();
  await db.insert(reviewLogs).values({
    cardId: card.id, userId: user.id, grade: 3, state: 0,
    due: new Date(), stability: 1, difficulty: 5,
    elapsedDays: 0, lastElapsedDays: 0, scheduledDays: 1,
  });

  // --- wrong confirmation: nothing deleted ---
  const bad = await deleteAccount(db, user.id, "not-the-email", email);
  check("wrong confirmation returns 400", bad.status === 400, bad);
  check("user still exists after a bad confirmation",
    (await db.select().from(users).where(eq(users.id, user.id))).length === 1);

  // --- correct confirmation: cascade wipes user data ---
  const ok = await deleteAccount(db, user.id, ` ${email.toUpperCase()} `, email);
  check("correct confirmation returns 200", ok.status === 200, ok);

  const gone = async (label: string, rows: unknown[]) =>
    check(`${label} removed by cascade`, rows.length === 0, rows.length);
  await gone("users row", await db.select().from(users).where(eq(users.id, user.id)));
  await gone("user_settings", await db.select().from(userSettings).where(eq(userSettings.userId, user.id)));
  await gone("sessions", await db.select().from(sessions).where(eq(sessions.userId, user.id)));
  await gone("albums", await db.select().from(albums).where(eq(albums.userId, user.id)));
  await gone("sentence_cards", await db.select().from(sentenceCards).where(eq(sentenceCards.userId, user.id)));
  await gone("review_logs", await db.select().from(reviewLogs).where(eq(reviewLogs.userId, user.id)));

  // --- shared content survives ---
  check("video survives (shared cache)",
    (await db.select().from(videos).where(eq(videos.id, video.id))).length === 1);
  check("subtitle line survives (shared cache)",
    (await db.select().from(subtitleLines).where(eq(subtitleLines.id, line.id))).length === 1);

  // cleanup shared rows this suite created
  await db.delete(videos).where(eq(videos.id, video.id));

  console.log(`\n${passed}/${passed + failed} checks passed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
