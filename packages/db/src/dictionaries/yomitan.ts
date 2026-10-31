// Yomitan dictionary importer (T3.4).
//
// Reads a Yomitan dictionary zip (the ecosystem's de-facto format) into
// `dictionaries` + `dictionary_terms` + `word_frequency` + `word_pitch`.
// Follows the JSON schemas of yomidevs/yomitan at master d3c54c10 (fetched
// 2026-10-31): dictionary-index-schema.json, dictionary-term-bank-v3-schema.json,
// dictionary-term-meta-bank-v3-schema.json, dictionary-tag-bank-v3-schema.json.
// Only format 3 is accepted (every current dictionary; 1/2 predate 2017).
//
// Safety:
//   - Nothing is extracted to disk and no code is ever run: only root-level
//     `index.json`, `term_bank_N.json`, `term_meta_bank_N.json` and
//     `tag_bank_N.json` are inflated in memory and JSON.parse'd. Images, CSS,
//     kanji banks and anything else are ignored.
//   - The archive is rejected if any entry name is absolute, has a `..`
//     segment, a backslash or a NUL (zip-slip shapes no real dictionary has).
//   - Size: the declared uncompressed size of the banks we read must stay under
//     `maxUncompressedBytes` (default 200 MB). fflate inflates each file into a
//     buffer of its declared size, so a lying header cannot inflate further.
//   - One bank is inflated at a time (memory ≈ zip + the largest bank).
//   - Definitions go through sanitizeStructuredContent (structured-content.ts).
//
// Idempotency: the dictionary's identity is its title. Re-importing a title —
// same or newer revision — replaces all its rows inside one transaction and
// keeps the row id, so users' enabled/order choices survive the update.

import { unzipSync, strFromU8, type UnzipFileInfo } from "fflate";
import { eq, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "../client";
import { dictionaries, dictionaryTerms, wordFrequency, wordPitch } from "../schema";
import type { DictDefinition, DictTagMeta } from "../types";
import { sanitizeStructuredContent } from "./structured-content";

export const DEFAULT_MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_ENTRIES = 50_000;
const MAX_FIELD = 2000;
const MAX_TERM = 200;
/** Titles that would collide with seeded pitch sources in word_pitch.source. */
const RESERVED_TITLES = new Set(["kanjium"]);

export class YomitanImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YomitanImportError";
  }
}

/* ------------------------------------------------------------------ */
/* index.json                                                          */
/* ------------------------------------------------------------------ */

export type YomitanIndex = {
  title: string;
  revision: string;
  format: number;
  author: string | null;
  attribution: string | null;
  url: string | null;
  description: string | null;
  sourceLanguage: string;
  targetLanguage: string | null;
  frequencyMode: "rank-based" | "occurrence-based" | null;
};

function optStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_FIELD) : null;
}

const ISO_RE = /^[a-z]{2,3}$/;

export function parseIndex(raw: unknown): YomitanIndex {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new YomitanImportError("index.json is not a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const title = optStr(o.title);
  const revision = optStr(o.revision);
  if (!title || title.length > 200) throw new YomitanImportError("index.json: missing or too long \"title\"");
  if (!revision || revision.length > 200) throw new YomitanImportError("index.json: missing \"revision\"");
  if (RESERVED_TITLES.has(title.toLowerCase())) {
    throw new YomitanImportError(`index.json: the title "${title}" is reserved`);
  }
  const format = (o.format ?? o.version) as unknown;
  if (format !== 3) {
    throw new YomitanImportError(
      format === 1 || format === 2
        ? `index.json: format ${format} is not supported (only format 3)`
        : "index.json: missing \"format\" (expected 3)",
    );
  }
  const src = optStr(o.sourceLanguage);
  const tgt = optStr(o.targetLanguage);
  const fm = o.frequencyMode;
  return {
    title,
    revision,
    format,
    author: optStr(o.author),
    attribution: optStr(o.attribution),
    url: optStr(o.url),
    description: optStr(o.description),
    sourceLanguage: src && ISO_RE.test(src) ? src : "ja",
    targetLanguage: tgt && ISO_RE.test(tgt) ? tgt : null,
    frequencyMode: fm === "rank-based" || fm === "occurrence-based" ? fm : null,
  };
}

/* ------------------------------------------------------------------ */
/* Archive listing                                                     */
/* ------------------------------------------------------------------ */

const BANK_RE = /^(term_bank|term_meta_bank|tag_bank)_(\d{1,6})\.json$/;

export type YomitanListing = {
  index: YomitanIndex;
  termBanks: string[];
  metaBanks: string[];
  tagBanks: string[];
  /** Declared uncompressed bytes of everything we will read. */
  bytes: number;
};

function unsafeName(name: string): boolean {
  return (
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name) ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.split("/").includes("..")
  );
}

function inflateOne(zip: Uint8Array, name: string): string {
  const files = unzipSync(zip, { filter: (f) => f.name === name });
  const data = files[name];
  if (!data) throw new YomitanImportError(`${name}: missing from the archive`);
  try {
    return strFromU8(data);
  } catch {
    throw new YomitanImportError(`${name}: not valid UTF-8`);
  }
}

function parseJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    throw new YomitanImportError(`${name}: invalid JSON`);
  }
}

function bankOrder(a: string, b: string): number {
  return Number(BANK_RE.exec(a)![2]) - Number(BANK_RE.exec(b)![2]);
}

/** List and validate the archive without inflating any bank. */
export function inspectYomitanZip(
  zip: Uint8Array,
  opts: { maxUncompressedBytes?: number } = {},
): YomitanListing {
  const max = opts.maxUncompressedBytes ?? DEFAULT_MAX_UNCOMPRESSED_BYTES;
  const entries: UnzipFileInfo[] = [];
  try {
    unzipSync(zip, {
      filter: (f) => {
        entries.push(f);
        return false;
      },
    });
  } catch (e) {
    throw new YomitanImportError(`not a readable zip archive (${e instanceof Error ? e.message : String(e)})`);
  }
  if (entries.length > MAX_ENTRIES) throw new YomitanImportError(`too many files in the archive (${entries.length})`);
  const bad = entries.find((f) => unsafeName(f.name));
  if (bad) throw new YomitanImportError(`unsafe path in the archive: ${JSON.stringify(bad.name.slice(0, 100))}`);

  const termBanks: string[] = [];
  const metaBanks: string[] = [];
  const tagBanks: string[] = [];
  let bytes = 0;
  let hasIndex = false;
  for (const f of entries) {
    const m = BANK_RE.exec(f.name);
    if (f.name === "index.json") hasIndex = true;
    else if (!m) continue;
    else if (m[1] === "term_bank") termBanks.push(f.name);
    else if (m[1] === "term_meta_bank") metaBanks.push(f.name);
    else tagBanks.push(f.name);
    bytes += f.originalSize;
  }
  if (!hasIndex) throw new YomitanImportError("index.json not found at the root of the archive");
  if (bytes > max) {
    throw new YomitanImportError(
      `uncompressed data is ${(bytes / 1048576).toFixed(1)} MB, over the ${(max / 1048576).toFixed(0)} MB limit`,
    );
  }
  const index = parseIndex(parseJson(inflateOne(zip, "index.json"), "index.json"));
  return {
    index,
    termBanks: termBanks.sort(bankOrder),
    metaBanks: metaBanks.sort(bankOrder),
    tagBanks: tagBanks.sort(bankOrder),
    bytes,
  };
}

/* ------------------------------------------------------------------ */
/* Banks                                                               */
/* ------------------------------------------------------------------ */

export type TermRow = {
  expression: string;
  reading: string;
  definitions: DictDefinition[];
  tags: string[];
  score: number;
  sequence: number | null;
};

function splitTags(v: unknown): string[] {
  return typeof v === "string" ? v.split(/\s+/).filter(Boolean).slice(0, 30).map((t) => t.slice(0, 60)) : [];
}

function cleanTerm(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= MAX_TERM ? t : null;
}

/** One v3 glossary item → a stored definition (null: dropped, e.g. images). */
export function parseDefinition(raw: unknown): DictDefinition | null {
  if (typeof raw === "string") return raw.trim() ? { type: "text", text: raw.slice(0, 64 * 1024) } : null;
  if (Array.isArray(raw)) {
    // Deinflection: [uninflected term, rule chain] → "form of X".
    return typeof raw[0] === "string" && raw[0] ? { type: "text", text: `→ ${raw[0].slice(0, MAX_TERM)}` } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.type === "text" && typeof o.text === "string" && o.text.trim()) {
    return { type: "text", text: o.text.slice(0, 64 * 1024) };
  }
  if (o.type === "structured-content") {
    const content = sanitizeStructuredContent(o.content);
    return content === null ? null : { type: "sc", content };
  }
  return null; // "image" and anything unknown
}

/** Parse a term_bank_N.json (v3 rows of 8). Malformed rows are counted, not fatal. */
export function parseTermBank(raw: unknown, name = "term bank"): { rows: TermRow[]; skipped: number } {
  if (!Array.isArray(raw)) throw new YomitanImportError(`${name}: expected a JSON array`);
  const rows: TermRow[] = [];
  let skipped = 0;
  for (const r of raw) {
    if (!Array.isArray(r) || r.length < 8) {
      skipped++;
      continue;
    }
    const expression = cleanTerm(r[0]);
    const reading = typeof r[1] === "string" && r[1].trim() ? cleanTerm(r[1]) : expression;
    const glossary = Array.isArray(r[5]) ? r[5] : [];
    const definitions = glossary.map(parseDefinition).filter((d): d is DictDefinition => d !== null);
    if (!expression || !reading || definitions.length === 0) {
      skipped++;
      continue;
    }
    const tags = [...new Set([...splitTags(r[2]), ...splitTags(r[7])])];
    const score = typeof r[4] === "number" && Number.isFinite(r[4]) ? r[4] : 0;
    const sequence = typeof r[6] === "number" && Number.isInteger(r[6]) && Math.abs(r[6]) < 2 ** 31 ? r[6] : null;
    rows.push({ expression, reading, definitions, tags, score, sequence });
  }
  return { rows, skipped };
}

export type FreqRow = { expression: string; reading: string; value: number; displayValue: string | null };
export type PitchMetaRow = { expression: string; reading: string; positions: number[] };

/** A frequency datum: number | numeric string | { value, displayValue }. */
function parseFrequency(raw: unknown): { value: number; displayValue: string | null } | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? { value: raw, displayValue: null } : null;
  if (typeof raw === "string") {
    const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(raw);
    return m ? { value: Number(m[1]), displayValue: raw.trim().slice(0, 60) } : null;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (typeof o.value !== "number" || !Number.isFinite(o.value)) return null;
    return { value: o.value, displayValue: typeof o.displayValue === "string" ? o.displayValue.slice(0, 60) : null };
  }
  return null;
}

/**
 * Yomitan pitch position → downstep mora: an integer is already one (0 =
 * heiban); an "HL" string ("LHHL", "HLL"…) gives the mora after which the
 * first drop happens, 0 when it never drops.
 */
export function pitchPositionToDownstep(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isInteger(raw) && raw >= 0 && raw < 64 ? raw : null;
  if (typeof raw !== "string" || !/^[HL]+$/.test(raw)) return null;
  for (let i = 0; i < raw.length - 1; i++) if (raw[i] === "H" && raw[i + 1] === "L") return i + 1;
  return 0;
}

/** Parse a term_meta_bank_N.json: "freq" and "pitch" rows ("ipa" is ignored). */
export function parseTermMetaBank(
  raw: unknown,
  name = "term meta bank",
): { freq: FreqRow[]; pitch: PitchMetaRow[]; skipped: number } {
  if (!Array.isArray(raw)) throw new YomitanImportError(`${name}: expected a JSON array`);
  const freq: FreqRow[] = [];
  const pitch: PitchMetaRow[] = [];
  let skipped = 0;
  for (const r of raw) {
    const expression = Array.isArray(r) ? cleanTerm(r[0]) : null;
    if (!Array.isArray(r) || !expression) {
      skipped++;
      continue;
    }
    const data = r[2];
    if (r[1] === "freq") {
      const withReading =
        data && typeof data === "object" && !Array.isArray(data) && "reading" in data && "frequency" in data;
      const d = withReading ? (data as { reading: unknown; frequency: unknown }) : null;
      const f = parseFrequency(d ? d.frequency : data);
      const reading = d ? cleanTerm(d.reading) : "";
      if (!f || reading === null) {
        skipped++;
        continue;
      }
      freq.push({ expression, reading, ...f });
    } else if (r[1] === "pitch") {
      const d = data as { reading?: unknown; pitches?: unknown } | null;
      const reading = d ? cleanTerm(d.reading) : null;
      const positions: number[] = [];
      if (reading && Array.isArray(d!.pitches)) {
        for (const p of d!.pitches) {
          const n = p && typeof p === "object" ? pitchPositionToDownstep((p as { position?: unknown }).position) : null;
          if (n !== null && !positions.includes(n)) positions.push(n);
        }
      }
      if (!reading || positions.length === 0) {
        skipped++;
        continue;
      }
      pitch.push({ expression, reading, positions });
    } else if (r[1] !== "ipa") {
      skipped++;
    }
  }
  return { freq, pitch, skipped };
}

/** Parse a tag_bank_N.json: [name, category, order, notes, score]. */
export function parseTagBank(raw: unknown): DictTagMeta {
  const out: DictTagMeta = {};
  if (!Array.isArray(raw)) return out;
  for (const r of raw) {
    if (!Array.isArray(r) || typeof r[0] !== "string" || !r[0]) continue;
    out[r[0].slice(0, 60)] = {
      ...(typeof r[1] === "string" && r[1] ? { category: r[1].slice(0, 60) } : {}),
      ...(typeof r[3] === "string" && r[3] ? { notes: r[3].slice(0, 200) } : {}),
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export type YomitanImportResult = {
  id: string;
  title: string;
  revision: string;
  type: "terms" | "frequency" | "pitch";
  replaced: boolean;
  terms: number;
  frequencies: number;
  pitches: number;
  skipped: number;
  ms: number;
};

export type YomitanImportOptions = {
  maxUncompressedBytes?: number;
  onProgress?: (msg: string) => void;
};

const TERM_BATCH = 1000;
const META_BATCH = 4000;
const INT_MAX = 2 ** 31 - 1;

async function insertChunks<T>(rows: readonly T[], size: number, insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

/**
 * Import (or re-import) a Yomitan zip. Everything happens in one transaction:
 * a failure leaves the previous revision untouched.
 */
export async function importYomitanZip(
  db: Database,
  zip: Uint8Array,
  opts: YomitanImportOptions = {},
): Promise<YomitanImportResult> {
  const t0 = Date.now();
  const log = opts.onProgress ?? (() => {});
  const listing = inspectYomitanZip(zip, opts);
  const { index } = listing;
  const language = index.sourceLanguage;
  log(
    `"${index.title}" rev ${index.revision}: ${listing.termBanks.length} term banks, ` +
      `${listing.metaBanks.length} meta banks, ${(listing.bytes / 1048576).toFixed(1)} MB`,
  );

  let tagMeta: DictTagMeta = {};
  for (const name of listing.tagBanks) tagMeta = { ...tagMeta, ...parseTagBank(parseJson(inflateOne(zip, name), name)) };

  return db.transaction(async (tx) => {
    const meta = {
      revision: index.revision,
      formatVersion: index.format,
      type: "terms",
      language,
      targetLanguage: index.targetLanguage,
      frequencyMode: index.frequencyMode,
      author: index.author,
      attribution: index.attribution,
      url: index.url,
      description: index.description,
      tagMeta,
      importedAt: new Date(),
    };
    const [existing] = await tx
      .select({ id: dictionaries.id })
      .from(dictionaries)
      .where(eq(dictionaries.title, index.title))
      .for("update");
    let id: string;
    if (existing) {
      id = existing.id;
      await tx.update(dictionaries).set(meta).where(eq(dictionaries.id, id));
      await clearDictionaryRows(tx, id);
      log("replacing the previous import");
    } else {
      const [row] = await tx.insert(dictionaries).values({ title: index.title, ...meta }).returning({ id: dictionaries.id });
      id = row!.id;
    }

    let skipped = 0;
    let terms = 0;
    for (const name of listing.termBanks) {
      const bank = parseTermBank(parseJson(inflateOne(zip, name), name), name);
      skipped += bank.skipped;
      await insertChunks(bank.rows, TERM_BATCH, (chunk) =>
        tx.insert(dictionaryTerms).values(chunk.map((r) => ({ dictionaryId: id, language, ...r }))),
      );
      terms += bank.rows.length;
      log(`${name}: ${bank.rows.length} terms`);
    }

    // Meta rows are merged across banks first (a (term, reading) may repeat).
    const occurrence = index.frequencyMode === "occurrence-based";
    const freqByKey = new Map<string, FreqRow>();
    const pitchByKey = new Map<string, PitchMetaRow>();
    for (const name of listing.metaBanks) {
      const bank = parseTermMetaBank(parseJson(inflateOne(zip, name), name), name);
      skipped += bank.skipped;
      for (const f of bank.freq) {
        const k = `${f.expression}\t${f.reading}`;
        const prev = freqByKey.get(k);
        // Keep the most frequent figure: lowest rank, or highest occurrence count.
        if (!prev || (occurrence ? f.value > prev.value : f.value < prev.value)) freqByKey.set(k, f);
      }
      for (const p of bank.pitch) {
        const k = `${p.expression}\t${p.reading}`;
        const prev = pitchByKey.get(k);
        if (prev) for (const n of p.positions) { if (!prev.positions.includes(n)) prev.positions.push(n); }
        else pitchByKey.set(k, { ...p, positions: [...p.positions] });
      }
      log(`${name}: ${bank.freq.length} frequencies, ${bank.pitch.length} pitch accents`);
    }

    const freqRows = [...freqByKey.values()];
    // rank: lower = more frequent, whatever the list's mode.
    const ranks = new Map<FreqRow, number>();
    if (occurrence) {
      [...freqRows].sort((a, b) => b.value - a.value).forEach((f, i) => ranks.set(f, i + 1));
    } else {
      for (const f of freqRows) ranks.set(f, Math.max(0, Math.min(INT_MAX, Math.round(f.value))));
    }
    await insertChunks(freqRows, META_BATCH, (chunk) =>
      tx.insert(wordFrequency).values(
        chunk.map((f) => ({
          dictionaryId: id, language, expression: f.expression, reading: f.reading,
          value: f.value, displayValue: f.displayValue, rank: ranks.get(f)!,
        })),
      ),
    );

    const pitchRows = [...pitchByKey.values()];
    await insertChunks(pitchRows, META_BATCH, (chunk) =>
      tx
        .insert(wordPitch)
        .values(
          chunk.map((p) => ({
            language, lemma: p.expression, reading: p.reading, positions: p.positions,
            source: index.title, dictionaryId: id,
          })),
        )
        .onConflictDoUpdate({
          target: [wordPitch.language, wordPitch.lemma, wordPitch.reading, wordPitch.source],
          set: { positions: sql`excluded.positions`, dictionaryId: sql`excluded.dictionary_id` },
        }),
    );

    const type = terms > 0 ? "terms" : freqRows.length > 0 ? "frequency" : pitchRows.length > 0 ? "pitch" : null;
    if (!type) throw new YomitanImportError("the archive has no terms, frequencies or pitch accents");
    await tx
      .update(dictionaries)
      .set({ type, termCount: terms, frequencyCount: freqRows.length, pitchCount: pitchRows.length })
      .where(eq(dictionaries.id, id));

    return {
      id, title: index.title, revision: index.revision, type, replaced: !!existing,
      terms, frequencies: freqRows.length, pitches: pitchRows.length, skipped, ms: Date.now() - t0,
    };
  });
}

/** Remove every row an import wrote for this dictionary (not the row itself). */
async function clearDictionaryRows(tx: DbOrTx, id: string): Promise<void> {
  await tx.delete(dictionaryTerms).where(eq(dictionaryTerms.dictionaryId, id));
  await tx.delete(wordFrequency).where(eq(wordFrequency.dictionaryId, id));
  await tx.delete(wordPitch).where(eq(wordPitch.dictionaryId, id));
}

/** Delete an imported dictionary and (cascade) all its rows. True if it existed. */
export async function deleteDictionary(db: DbOrTx, id: string): Promise<boolean> {
  const rows = await db.delete(dictionaries).where(eq(dictionaries.id, id)).returning({ id: dictionaries.id });
  return rows.length > 0;
}
