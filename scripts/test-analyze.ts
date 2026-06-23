// Quick test: run analyzeLine on a test sentence
import { createDb } from "@fuchine/db/src/client.js";
import { analyzeLine } from "@fuchine/nlp/src/analyze.js";

async function main() {
  const db = createDb(process.env.DATABASE_URL || "postgres://fuchine:fuchine@localhost:5432/fuchine");

  const tokens = await analyzeLine("皆さん、この動画を見てください。", "ja", db);
  console.log("Tokens:", JSON.stringify(tokens, null, 2));

  const resolved = tokens.filter((t) => t.wordEntryId != null);
  console.log(`\nResolved (${resolved.length}):`);
  for (const t of resolved) {
    console.log(`  "${t.surface}" lemma="${t.lemma}" reading="${t.reading}" wordEntryId=${t.wordEntryId}`);
  }

  await db.$client.end();
}

main().catch(console.error);
