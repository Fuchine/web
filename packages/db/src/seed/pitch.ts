// Pitch accent seed (T3.2): Kanjium's accents.txt -> word_pitch.
//
// Library half (parse + download + upsert); the CLI is pitch-cli.ts. Kept free
// of dotenv/side effects so the E2E suite can import it and seed the fixture.
//
// Source: https://github.com/mifunetoshiro/kanjium (data/source_files/raw/
// accents.txt), CC BY-SA 4.0 — attribution in NOTICE. Downloaded at seed time
// into seeds/data/ (gitignored), never committed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { Database } from "../client";
import { wordPitch } from "../schema";

export const KANJIUM_SOURCE = "kanjium";
/**
 * Pinned Kanjium commit (master on 2026-10-30), so a seed is reproducible and
 * the attributed revision is known. Override with KANJIUM_REF to move it.
 */
export const KANJIUM_DEFAULT_REF = "9ebca4589565c696e7c39e089e2e928ad65f678c";
const KANJIUM_PATH = "data/source_files/raw/accents.txt";
export const DATA_DIR = "seeds/data";

export type PitchRow = {
  language: string;
  lemma: string;
  reading: string;
  positions: number[];
  source: string;
};

/**
 * Parse one accents field. Plain ("0,2") or POS-qualified ("(副)0,(名)3",
 * "(副)1,0,(形動)0"): the POS hints are dropped and every distinct downstep is
 * kept in source order.
 */
export function parseAccentField(field: string): number[] {
  const out: number[] = [];
  for (const part of field.split(",")) {
    const m = /^\s*(?:\([^)]*\))?\s*(\d+)\s*$/.exec(part);
    if (!m) continue;
    const n = Number.parseInt(m[1]!, 10);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Parse Kanjium's accents.txt: `expression<TAB>reading<TAB>accents`, one word
 * per line. An empty reading means a kana-only word (reading = expression).
 * Lines repeating a (lemma, reading) are merged; malformed lines are skipped.
 */
export function parseKanjiumAccents(text: string, language = "ja"): PitchRow[] {
  const byKey = new Map<string, PitchRow>();
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cols = raw.split("\t");
    if (cols.length < 3) continue;
    const lemma = cols[0]!.trim();
    const reading = cols[1]!.trim() || lemma;
    const positions = parseAccentField(cols[2]!);
    if (!lemma || positions.length === 0) continue;
    const key = `${lemma}\t${reading}`;
    const existing = byKey.get(key);
    if (existing) {
      for (const p of positions) if (!existing.positions.includes(p)) existing.positions.push(p);
    } else {
      byKey.set(key, { language, lemma, reading, positions, source: KANJIUM_SOURCE });
    }
  }
  return [...byKey.values()];
}

/** Download accents.txt (pinned ref) into seeds/data/ unless already there. */
export async function ensureKanjium(ref = process.env.KANJIUM_REF || KANJIUM_DEFAULT_REF): Promise<string> {
  const path = join(DATA_DIR, `kanjium-accents-${ref.slice(0, 12)}.txt`);
  if (existsSync(path)) {
    console.log(`[pitch] already downloaded: ${path}`);
    return path;
  }
  const url = `https://raw.githubusercontent.com/mifunetoshiro/kanjium/${ref}/${KANJIUM_PATH}`;
  console.log(`[pitch] downloading ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": "fuchine-seed" } });
  if (!res.ok) throw new Error(`Kanjium download failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, text);
  console.log(`[pitch] wrote ${path}`);
  return path;
}

const BATCH_SIZE = 2000;

/** Idempotent upsert on (language, lemma, reading, source). Returns rows written. */
export async function upsertPitch(db: Database, rows: readonly PitchRow[]): Promise<number> {
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db
      .insert(wordPitch)
      .values(batch as PitchRow[])
      .onConflictDoUpdate({
        target: [wordPitch.language, wordPitch.lemma, wordPitch.reading, wordPitch.source],
        set: { positions: sql`excluded.positions` },
      });
    done += batch.length;
    if (done % 20000 === 0 || done === rows.length) console.log(`[pitch] ${done}/${rows.length}`);
  }
  return done;
}

/** Parse a local accents.txt and upsert it. */
export async function seedPitchFile(db: Database, path: string): Promise<number> {
  const rows = parseKanjiumAccents(readFileSync(path, "utf8"));
  console.log(`[pitch] ${rows.length} (lemma, reading) rows parsed from ${path}`);
  return upsertPitch(db, rows);
}

/** How many word_entries have at least one pitch row (for the seed report). */
export async function countPitchMatches(db: Database, language = "ja") {
  const rows = await db.execute<{ entries: string; matched: string; pitch: string }>(sql`
    SELECT
      (SELECT count(*) FROM word_entries WHERE language = ${language}) AS entries,
      (SELECT count(*) FROM word_entries e WHERE e.language = ${language} AND EXISTS (
        SELECT 1 FROM word_pitch p
        WHERE p.language = e.language AND p.lemma = e.lemma AND p.reading = e.reading
      )) AS matched,
      (SELECT count(*) FROM word_pitch WHERE language = ${language}) AS pitch
  `);
  const r = rows[0]!;
  return { entries: Number(r.entries), matched: Number(r.matched), pitch: Number(r.pitch) };
}
