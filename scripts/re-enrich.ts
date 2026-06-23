// Re-enrich all subtitle_lines that have null wordEntryId.
// Usage: pnpm --filter @fuchine/worker exec tsx scripts/re-enrich.ts
// (Must be run from the monorepo root after `pnpm install`.)

import { asc, eq, and, isNull } from "drizzle-orm";
import { createDb, subtitleLines } from "@fuchine/db";
import { analyzeLine } from "@fuchine/nlp";

async function main() {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://fuchine:fuchine@localhost:5432/fuchine");

  const lines = await db
    .select({ id: subtitleLines.id, textOriginal: subtitleLines.textOriginal })
    .from(subtitleLines)
    .limit(500);

  console.log(`Re-enriching ${lines.length} lines...`);

  let updated = 0;
  for (const line of lines) {
    const tokens = await analyzeLine(line.textOriginal, "ja", db);
    const resolved = tokens.filter((t) => t.wordEntryId != null).length;
    if (resolved > 0) {
      console.log(`  ${line.id}: ${resolved}/${tokens.length} resolved`);
      await db.update(subtitleLines).set({ tokens }).where(eq(subtitleLines.id, line.id));
      updated++;
    }
  }

  console.log(`\nDone. Updated ${updated} lines.`);
  await db.$client.end();
}

main().catch(console.error);
