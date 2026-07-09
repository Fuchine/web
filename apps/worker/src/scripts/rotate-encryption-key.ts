// One-shot: re-encrypt every stored BYOK key from the old encryption key to the
// new one, so FUCHINE_ENCRYPTION_KEY can be rotated without every user having to
// re-enter their key.
//
//   OLD_ENCRYPTION_KEY=<old base64>  FUCHINE_ENCRYPTION_KEY=<new base64> \
//     pnpm --filter @fuchine/worker rotate:key
//
// Each user's api_key_enc is decrypted with the old key and re-encrypted with the
// new one in a single atomic UPDATE per row (not one wrapping transaction). Safe
// to resume: an interrupted run leaves a mix of old/new ciphertext, and a re-run
// skips already-rotated rows (they no longer decrypt with the old key). A row that
// fails to decrypt with the old key is reported and skipped, not fatal.

import { eq, isNotNull } from "drizzle-orm";
import { createDb, userSettings } from "@fuchine/db";
import { encryptApiKey, decryptApiKey } from "@fuchine/llm";
import { env } from "../env";

async function main() {
  const oldKey = process.env.OLD_ENCRYPTION_KEY;
  const newKey = process.env.FUCHINE_ENCRYPTION_KEY;
  if (!oldKey || !newKey) {
    throw new Error(
      "Set OLD_ENCRYPTION_KEY (current key) and FUCHINE_ENCRYPTION_KEY (new key).",
    );
  }
  if (oldKey === newKey) {
    console.log("Old and new keys are identical — nothing to rotate.");
    return;
  }

  const db = createDb(env.databaseUrl);
  const rows = await db
    .select({ userId: userSettings.userId, apiKeyEnc: userSettings.apiKeyEnc })
    .from(userSettings)
    .where(isNotNull(userSettings.apiKeyEnc));

  let rotated = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.apiKeyEnc) continue;
    let plaintext: string;
    try {
      plaintext = decryptApiKey(row.apiKeyEnc, oldKey);
    } catch {
      console.warn(`  skip ${row.userId}: does not decrypt with OLD_ENCRYPTION_KEY`);
      skipped++;
      continue;
    }
    const reEnc = encryptApiKey(plaintext, newKey);
    await db
      .update(userSettings)
      .set({ apiKeyEnc: reEnc })
      .where(eq(userSettings.userId, row.userId));
    rotated++;
  }

  console.log(`Rotation done: ${rotated} re-encrypted, ${skipped} skipped, ${rows.length} total.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
