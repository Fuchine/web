// One-command seed of the full English JMdict:
//
//   pnpm --filter @fuchine/db seed:jmdict [frequency.tsv]
//
// Downloads the latest jmdict-simplified English release (cached in seeds/data/)
// and upserts every entry into word_entries. Frequency list is optional.

import { config } from "dotenv";

config({ path: "../../.env" });
config({ path: ".env" });

import { ensureJmdict } from "./fetch-jmdict";
import { runSeed } from "./index";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const frequencyPath = process.argv[2] ?? process.env.FREQUENCY_PATH;
  const jmdictPath = await ensureJmdict();

  await runSeed({ jmdictPath, frequencyPath, databaseUrl });
  process.exit(0);
}

main().catch((err) => {
  console.error("[jmdict] failed:", err);
  process.exit(1);
});
