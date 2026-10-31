// Imported (Yomitan) dictionaries on the web side (T3.4): what is installed,
// each user's choice (which to show, in what order, which frequency list
// drives the Lapis FreqSort), and the batched lookup that attaches their
// terms and ranks to JMdict entries. Auth-agnostic and testable; the routes
// do auth, the admin gate lives in lib/admin.ts.

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  type Database,
  type DictDefinition,
  type DictionaryPrefs,
  dictionaries,
  dictionaryTerms,
  userSettings,
  wordFrequency,
} from "@fuchine/db";
import { isUuid } from "./ids";

export type InstalledDictionary = {
  id: string;
  title: string;
  revision: string;
  type: string; // terms | frequency | pitch
  language: string;
  monolingual: boolean;
  author: string | null;
  attribution: string | null;
  url: string | null;
  description: string | null;
  termCount: number;
  frequencyCount: number;
  pitchCount: number;
  frequencyMode: string | null;
  importedAt: string;
  enabled: boolean;
};

const MAX_ENABLED = 30;

function toInstalled(d: typeof dictionaries.$inferSelect): InstalledDictionary {
  return {
    id: d.id,
    title: d.title,
    revision: d.revision,
    type: d.type,
    language: d.language,
    monolingual: d.termCount > 0 && d.targetLanguage === d.language,
    author: d.author,
    attribution: d.attribution,
    url: d.url,
    description: d.description,
    termCount: d.termCount,
    frequencyCount: d.frequencyCount,
    pitchCount: d.pitchCount,
    frequencyMode: d.frequencyMode,
    importedAt: d.importedAt.toISOString(),
    enabled: d.enabled,
  };
}

/** Installed dictionaries (title order); disabled ones only when asked (admin). */
export async function listInstalledDictionaries(
  db: Database,
  opts: { includeDisabled?: boolean } = {},
): Promise<InstalledDictionary[]> {
  const rows = await db
    .select()
    .from(dictionaries)
    .where(opts.includeDisabled ? undefined : eq(dictionaries.enabled, true))
    .orderBy(asc(dictionaries.title));
  return rows.map(toInstalled);
}

/**
 * The user's dictionaries, resolved: enabled ones in their order (only those
 * still installed and instance-enabled) and the chosen frequency list.
 */
export type UserDictionaries = {
  ordered: InstalledDictionary[];
  frequency: InstalledDictionary | null;
};

export async function getUserDictionaries(db: Database, userId: string): Promise<UserDictionaries> {
  const [s] = await db
    .select({ prefs: userSettings.dictionaryPrefs })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const prefs: DictionaryPrefs = s?.prefs ?? {};
  const ids = [...new Set([...(prefs.enabled ?? []), ...(prefs.frequency ? [prefs.frequency] : [])])].filter(isUuid);
  if (ids.length === 0) return { ordered: [], frequency: null };
  const rows = await db
    .select()
    .from(dictionaries)
    .where(and(inArray(dictionaries.id, ids), eq(dictionaries.enabled, true)));
  const byId = new Map(rows.map((r) => [r.id, toInstalled(r)]));
  const freq = prefs.frequency ? byId.get(prefs.frequency) : undefined;
  return {
    ordered: (prefs.enabled ?? []).map((id) => byId.get(id)).filter((d): d is InstalledDictionary => !!d),
    frequency: freq && freq.frequencyCount > 0 ? freq : null,
  };
}

/** Settings view: what is installed + the user's current choice. */
export async function getDictionarySettings(db: Database, userId: string) {
  const [installed, mine] = await Promise.all([listInstalledDictionaries(db), getUserDictionaries(db, userId)]);
  return {
    installed,
    enabled: mine.ordered.map((d) => d.id),
    frequency: mine.frequency?.id ?? null,
  };
}

/**
 * PUT /api/settings/dictionaries body → stored prefs. `enabled`: ordered ids
 * of installed, instance-enabled dictionaries (≤ 30, no repeats); `frequency`:
 * the id of one with frequency data, or null.
 */
export async function updateDictionaryPrefs(
  db: Database,
  userId: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: { error: "Expected { enabled, frequency }." } };
  }
  const b = body as { enabled?: unknown; frequency?: unknown };
  const enabled = b.enabled ?? [];
  if (!Array.isArray(enabled) || enabled.length > MAX_ENABLED || !enabled.every(isUuid)) {
    return { status: 400, body: { error: `"enabled" must be a list of at most ${MAX_ENABLED} dictionary ids.` } };
  }
  if (new Set(enabled).size !== enabled.length) {
    return { status: 400, body: { error: "A dictionary appears twice in \"enabled\"." } };
  }
  const frequency = b.frequency ?? null;
  if (frequency !== null && !isUuid(frequency)) {
    return { status: 400, body: { error: "\"frequency\" must be a dictionary id or null." } };
  }
  const ids = [...new Set([...enabled, ...(frequency ? [frequency] : [])])];
  const rows = ids.length
    ? await db
        .select({ id: dictionaries.id, frequencyCount: dictionaries.frequencyCount })
        .from(dictionaries)
        .where(and(inArray(dictionaries.id, ids), eq(dictionaries.enabled, true)))
    : [];
  const known = new Map(rows.map((r) => [r.id, r]));
  if (ids.some((id) => !known.has(id))) return { status: 400, body: { error: "Unknown dictionary." } };
  if (frequency && !(known.get(frequency)!.frequencyCount > 0)) {
    return { status: 400, body: { error: "That dictionary has no frequency data." } };
  }
  const prefs: DictionaryPrefs = { enabled, frequency };
  await db
    .insert(userSettings)
    .values({ userId, dictionaryPrefs: prefs })
    .onConflictDoUpdate({ target: userSettings.userId, set: { dictionaryPrefs: prefs } });
  return { status: 200, body: { enabled, frequency } };
}

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

export type ImportedEntry = { expression: string; reading: string; definitions: DictDefinition[]; tags: string[] };
export type ImportedSection = { dictionaryId: string; title: string; monolingual: boolean; entries: ImportedEntry[] };
export type ImportedFrequency = { dictionaryId: string; title: string; rank: number; display: string | null };

type Keyed = { language: string; lemma: string; reading: string | null };

const MAX_ENTRIES_PER_DICT = 4;

/** Natural-key matching shared by terms and frequencies. */
function matches(row: { expression: string; reading: string }, e: Keyed): "exact" | "lemma" | null {
  if (row.expression === e.lemma) {
    if (!e.reading || row.reading === e.reading || row.reading === "") return "exact";
    return "lemma";
  }
  // Kana-only JMdict words (lemma = reading) listed by their kana headword.
  if (e.reading && e.lemma === e.reading && row.expression === e.reading) return "exact";
  return null;
}

/**
 * Best frequency rank per entry in each dictionary: exact (expression,
 * reading) — or a reading-less row — first, else the lemma's best rank.
 */
function bestRank<R extends { dictionaryId: string; expression: string; reading: string; rank: number }>(
  rows: R[],
  e: Keyed,
  dictionaryId: string,
): R | null {
  let exact: R | null = null;
  let lemma: R | null = null;
  for (const r of rows) {
    if (r.dictionaryId !== dictionaryId) continue;
    const m = matches(r, e);
    if (m === "exact" && (!exact || r.rank < exact.rank)) exact = r;
    if (m === "lemma" && (!lemma || r.rank < lemma.rank)) lemma = r;
  }
  return exact ?? lemma;
}

/** One query for every (dictionary, expression) the batch needs. */
async function frequencyRows(db: Database, dictionaryIds: string[], entries: Keyed[]) {
  const exprs = [...new Set(entries.flatMap((e) => [e.lemma, ...(e.reading ? [e.reading] : [])]))];
  if (dictionaryIds.length === 0 || exprs.length === 0) return [];
  return db
    .select({
      dictionaryId: wordFrequency.dictionaryId,
      expression: wordFrequency.expression,
      reading: wordFrequency.reading,
      rank: wordFrequency.rank,
      displayValue: wordFrequency.displayValue,
    })
    .from(wordFrequency)
    .where(
      and(
        inArray(wordFrequency.dictionaryId, dictionaryIds),
        inArray(wordFrequency.language, [...new Set(entries.map((e) => e.language))]),
        inArray(wordFrequency.expression, exprs),
      ),
    );
}

/**
 * Attach the user's imported dictionaries to JMdict entries: `dictionaries`
 * (term sections in the user's order, exact expression+reading matches, else
 * the lemma's entries) and `frequencies` (rank in each enabled frequency
 * list). Two indexed queries for the whole batch, whatever its size.
 */
export async function withImportedDictionaries<T extends Keyed>(
  db: Database,
  user: UserDictionaries,
  entries: T[],
): Promise<(T & { dictionaries: ImportedSection[]; frequencies: ImportedFrequency[] })[]> {
  const termDicts = user.ordered.filter((d) => d.termCount > 0);
  const freqDicts = user.ordered.filter((d) => d.frequencyCount > 0);
  const languages = [...new Set(entries.map((e) => e.language))];
  const exprs = [...new Set(entries.flatMap((e) => [e.lemma, ...(e.reading ? [e.reading] : [])]))];

  const [terms, freqs] = await Promise.all([
    termDicts.length && exprs.length
      ? db
          .select({
            dictionaryId: dictionaryTerms.dictionaryId,
            expression: dictionaryTerms.expression,
            reading: dictionaryTerms.reading,
            definitions: dictionaryTerms.definitions,
            tags: dictionaryTerms.tags,
          })
          .from(dictionaryTerms)
          .where(
            and(
              inArray(dictionaryTerms.dictionaryId, termDicts.map((d) => d.id)),
              inArray(dictionaryTerms.language, languages),
              inArray(dictionaryTerms.expression, exprs),
            ),
          )
          .orderBy(desc(dictionaryTerms.score), asc(dictionaryTerms.sequence), asc(dictionaryTerms.id))
      : Promise.resolve([]),
    frequencyRows(db, freqDicts.map((d) => d.id), entries),
  ]);

  return entries.map((e) => {
    const sections: ImportedSection[] = [];
    for (const d of termDicts) {
      const mine = terms.filter((t) => t.dictionaryId === d.id);
      const exact = mine.filter((t) => matches(t, e) === "exact");
      const picked = (exact.length ? exact : mine.filter((t) => matches(t, e) === "lemma")).slice(0, MAX_ENTRIES_PER_DICT);
      if (picked.length) {
        sections.push({
          dictionaryId: d.id,
          title: d.title,
          monolingual: d.monolingual,
          entries: picked.map((t) => ({ expression: t.expression, reading: t.reading, definitions: t.definitions, tags: t.tags })),
        });
      }
    }
    const frequencies: ImportedFrequency[] = [];
    for (const d of freqDicts) {
      const r = bestRank(freqs, e, d.id);
      if (r) frequencies.push({ dictionaryId: d.id, title: d.title, rank: r.rank, display: r.displayValue });
    }
    return { ...e, dictionaries: sections, frequencies };
  });
}

/**
 * Rank of each entry in ONE frequency list (the Lapis FreqSort list), keyed
 * by the caller's id. Entries the list lacks are absent from the map.
 */
export async function ranksInList<T extends Keyed & { id: string }>(
  db: Database,
  list: Pick<InstalledDictionary, "id">,
  entries: T[],
): Promise<Map<string, { rank: number; display: string | null }>> {
  const out = new Map<string, { rank: number; display: string | null }>();
  for (let i = 0; i < entries.length; i += 2000) {
    const chunk = entries.slice(i, i + 2000);
    const rows = await frequencyRows(db, [list.id], chunk);
    for (const e of chunk) {
      const r = bestRank(rows, e, list.id);
      if (r) out.set(e.id, { rank: r.rank, display: r.displayValue });
    }
  }
  return out;
}

/** Ids of the user's enabled dictionaries that carry pitch (for withPitch). */
export function pitchDictionaryIds(user: UserDictionaries): string[] {
  return user.ordered.filter((d) => d.pitchCount > 0).map((d) => d.id);
}
