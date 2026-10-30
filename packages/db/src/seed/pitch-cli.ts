// Pitch accent seed (T3.2):
//
//   pnpm --filter @fuchine/db seed:pitch               # download Kanjium (pinned ref) + upsert
//   pnpm --filter @fuchine/db seed:pitch <accents.txt> # a local file (e.g. the fixture)
//
// Idempotent: upserts on (language, lemma, reading, source). Independent of the
// JMdict seed (no FK), so either can run first; the match report is only
// meaningful once word_entries is seeded.

import { config } from "dotenv";

config({ path: "../../.env" });
config({ path: ".env" });

import { createDb } from "../client";
import { countPitchMatches, ensureKanjium, seedPitchFile } from "./pitch";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const path = process.argv[2] ?? process.env.KANJIUM_PATH ?? (await ensureKanjium());
  const db = createDb(databaseUrl, { max: 2 });
  await seedPitchFile(db, path);

  const { entries, matched, pitch } = await countPitchMatches(db);
  const pct = entries > 0 ? ((matched / entries) * 100).toFixed(1) : "0.0";
  console.log(`[pitch] word_pitch rows: ${pitch}; word_entries with pitch: ${matched}/${entries} (${pct}%)`);
  console.log("[pitch] done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[pitch] failed:", err);
  process.exit(1);
});
