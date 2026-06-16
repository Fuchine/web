// Dictionary lookups (F1 popup + F2 search). Auth-agnostic and testable.

import { eq } from "drizzle-orm";
import { type Database, wordEntries } from "@fuchine/db";
import { getDictionary } from "@fuchine/nlp";

/** Fetch one entry by id — what the player popup uses for a resolved token. */
export async function lookupById(db: Database, id: string) {
  const [entry] = await db
    .select()
    .from(wordEntries)
    .where(eq(wordEntries.id, id))
    .limit(1);
  return entry ?? null;
}

/** Search by lemma or reading (most frequent first). */
export async function searchDictionary(db: Database, q: string, language = "ja") {
  return getDictionary(language, db).lookup(q);
}
