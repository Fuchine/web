/**
 * End-to-end test for word bookmarks (F2). Runs the REAL lib functions
 * (getSavedWordIds / saveWord / unsaveWord) against a live Postgres. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-saved.ts
 */
import { createDb, users, wordEntries, type Database, type Definition } from "@fuchine/db";
import { eq } from "drizzle-orm";
import { getSavedWordIds, saveWord, unsaveWord } from "../lib/dictionary";

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
  console.log("\n=== E2E: saved words ===\n");

  const [user] = await db.insert(users).values({ email: `e2e-saved-${Date.now()}@example.com` }).returning();
  const def: Definition[] = [{ glosses: ["cat"], partsOfSpeech: ["n"] }];
  const [word] = await db
    .insert(wordEntries)
    .values({ language: "ja", lemma: `猫${Date.now()}`, reading: "ねこ", pos: "noun", definitions: def })
    .returning();

  check("starts empty", (await getSavedWordIds(db, user.id)).length === 0);

  await saveWord(db, user.id, word.id);
  let ids = await getSavedWordIds(db, user.id);
  check("save adds the id", ids.length === 1 && ids[0] === word.id, ids);

  await saveWord(db, user.id, word.id); // idempotent
  ids = await getSavedWordIds(db, user.id);
  check("re-save is idempotent (still one)", ids.length === 1, ids.length);

  await unsaveWord(db, user.id, word.id);
  check("unsave removes it", (await getSavedWordIds(db, user.id)).length === 0);

  await unsaveWord(db, user.id, word.id); // no-op
  check("unsave of absent is a no-op", (await getSavedWordIds(db, user.id)).length === 0);

  // Cleanup (deleting the user cascades to saved_words).
  await db.delete(users).where(eq(users.id, user.id));
  await db.delete(wordEntries).where(eq(wordEntries.id, word.id));

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

async function closeDb() {
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch(async (err) => { console.error("E2E crashed:", err); await closeDb(); process.exit(1); });
