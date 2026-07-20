/**
 * OPS-4 rehearsal: verify a RESTORED database (backup → restore cycle).
 *
 * Points at the throwaway Postgres that received the pg_restore and checks the
 * three things the runbook (DEPLOY_CHECKLIST Apêndice A) cares about:
 *   1. sessions survived the dump (login would work),
 *   2. a video with subtitle lines + tokens is intact,
 *   3. the BYOK ciphertext decrypts with the same FUCHINE_ENCRYPTION_KEY —
 *      via the REAL resolveUserProvider, no mocks.
 *
 *   DATABASE_URL=postgres://... FUCHINE_ENCRYPTION_KEY=... \
 *     pnpm --filter @fuchine/web exec tsx scripts/e2e-restore-verify.ts
 */
import { createDb, users, sessions, videos, subtitleLines, userSettings } from "@fuchine/db";
import { resolveUserProvider, decryptApiKey } from "@fuchine/llm";
import { eq, isNotNull, sql } from "drizzle-orm";

const urlEnv = process.env.DATABASE_URL;
const encKeyEnv = process.env.FUCHINE_ENCRYPTION_KEY;
if (!urlEnv || !encKeyEnv) {
  console.error("DATABASE_URL and FUCHINE_ENCRYPTION_KEY are required");
  process.exit(1);
}
// Narrowed copies: the guard above doesn't carry into main()'s closure.
const url: string = urlEnv;
const encKey: string = encKeyEnv;
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

async function main() {
  console.log("\n=== E2E: restored DB (OPS-4) ===\n");

  // 1. Sessions came through (DB-backed login).
  const [sess] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions);
  check("sessions restored (>0)", sess.n > 0, sess);

  // 2. Videos + subtitle lines with tokens.
  const [vid] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(videos);
  const [lines] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(subtitleLines);
  const [tokenized] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(subtitleLines)
    .where(isNotNull(subtitleLines.tokens));
  check("videos restored (>0)", vid.n > 0, vid);
  check("subtitle lines restored (>0)", lines.n > 0, lines);
  check("tokenized lines present (>0)", tokenized.n > 0, tokenized);

  // 3. BYOK: find the rehearsal row and decrypt with the same key.
  const [row] = await db
    .select({ userId: userSettings.userId, apiKeyEnc: userSettings.apiKeyEnc })
    .from(userSettings)
    .where(isNotNull(userSettings.apiKeyEnc));
  check("BYOK ciphertext row restored", !!row, row);
  if (row?.apiKeyEnc) {
    const plain = decryptApiKey(row.apiKeyEnc, encKey);
    check("ciphertext decrypts with the same key", plain === "rehearsal-byok-sk-ops4", "(mismatch)");
    const provider = await resolveUserProvider(db, row.userId, encKey);
    check("resolveUserProvider resolves from restored row", !!provider);
  }

  // Bonus: user emails survived (spot check, no PII printed).
  const [usr] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.email, "rehearsal-ops4@example.com"));
  check("rehearsal user restored", usr.n === 1, usr);

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("verify crashed:", err);
  process.exit(1);
});
