/**
 * End-to-end test for settings persistence (T1.8).
 *
 * Runs the REAL `updateSettings` lib function against a live Postgres, then
 * verifies the BYOK key round-trips through `resolveUserProvider`. No mocks.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-settings.ts
 */
import { createDb, users, userSettings } from "@fuchine/db";
import { resolveUserProvider } from "@fuchine/llm";
import { eq } from "drizzle-orm";
import { updateSettings } from "../lib/settings";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url);

// A valid base64 32-byte key for AES-256-GCM.
const ENC_KEY = Buffer.alloc(32, 7).toString("base64");

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
  console.log("\n=== E2E: settings (BYOK) ===\n");

  // Seed: user + its settings row (created at signup in real flow).
  const [user] = await db
    .insert(users)
    .values({ email: `e2e-settings-${Date.now()}@example.com` })
    .returning();
  await db.insert(userSettings).values({ userId: user.id });

  console.log(`Seeded user=${user.id}\n`);

  // 1. Reject unknown provider.
  console.log("1. Validation");
  const bad = await updateSettings(db, user.id, { llmProvider: "bogus" }, ENC_KEY);
  check("unknown provider => 400", bad.status === 400, bad);

  // 2. Save provider + key + language.
  console.log("2. Save provider + key + language");
  const saved = await updateSettings(
    db,
    user.id,
    { llmProvider: "minimax", explanationLanguage: "ja", apiKey: "sk-secret-123" },
    ENC_KEY,
  );
  check("save => 200", saved.status === 200, saved);
  check("provider echoed", saved.body.llmProvider === "minimax", saved.body);
  check("language echoed", saved.body.explanationLanguage === "ja", saved.body);
  check("hasApiKey true", saved.body.hasApiKey === true, saved.body);

  // 3. The response must NOT leak the key (plaintext or ciphertext).
  console.log("3. No key leak");
  const blob = JSON.stringify(saved.body);
  check("response has no plaintext key", !blob.includes("sk-secret-123"), blob);
  const [rowAfterSave] = await db
    .select({ apiKeyEnc: userSettings.apiKeyEnc })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id));
  check("ciphertext not equal to plaintext", rowAfterSave.apiKeyEnc !== "sk-secret-123", rowAfterSave.apiKeyEnc);
  check("response does not contain ciphertext", !blob.includes(rowAfterSave.apiKeyEnc ?? "__none__"), blob);

  // 4. The AI layer can resolve the provider from the stored key.
  console.log("4. resolveUserProvider works");
  const provider = await resolveUserProvider(db, user.id, ENC_KEY);
  check("provider resolved", !!provider, provider);

  // 5. Saving language alone must NOT wipe the key.
  console.log("5. Partial update keeps key");
  const langOnly = await updateSettings(db, user.id, { explanationLanguage: "en" }, ENC_KEY);
  check("language updated", langOnly.body.explanationLanguage === "en", langOnly.body);
  check("key still present", langOnly.body.hasApiKey === true, langOnly.body);

  // 6. removeKey clears the key.
  console.log("6. Remove key");
  const removed = await updateSettings(db, user.id, { removeKey: true }, ENC_KEY);
  check("hasApiKey false after remove", removed.body.hasApiKey === false, removed.body);

  // Cleanup: deleting the user cascades to its settings row.
  await db.delete(users).where(eq(users.id, user.id));

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
