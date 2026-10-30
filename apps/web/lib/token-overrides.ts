// Per-user token corrections (T3.7): load + apply on every read path that shows
// a user tokens, and the PUT/DELETE behind /api/lines/:id/tokens. The shared
// subtitle_lines.tokens and the AI explanation cache are never written here.
// Spec: docs/plans/2026-10-30-token-overrides-spec.md.

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  type Database,
  type DbOrTx,
  type Token,
  subtitleLines,
  tokenOverrides,
  videos,
  wordEntries,
} from "@fuchine/db";
import {
  applyTokenOverridesDetailed,
  isHiraganaReading,
  isKanaOnly,
  isNoopOverride,
  toHiragana,
  validateTokenOverride,
  type TokenOverride,
  type TokenSpan,
} from "@fuchine/core";
import { getDictionary, hiraToRomaji } from "@fuchine/nlp";
import { isUuid } from "./ids";
import type { WordEntryData } from "./cards";

export type { TokenSpan };
type Result = { status: number; body: Record<string, unknown> };

/** Input caps (B1: no unbounded writes). A line rarely has more than ~40 tokens. */
export const MAX_OVERRIDE_TOKENS = 32;
export const MAX_TOKEN_FIELD = 64;

const LOAD_CHUNK = 5000;

/** This user's overrides for the given lines, grouped by line — one query per 5000 lines. */
export async function loadTokenOverrides(
  db: DbOrTx,
  userId: string,
  lineIds: readonly string[],
): Promise<Map<string, TokenOverride[]>> {
  const out = new Map<string, TokenOverride[]>();
  const unique = [...new Set(lineIds)];
  for (let i = 0; i < unique.length; i += LOAD_CHUNK) {
    const rows = await db
      .select({
        lineId: tokenOverrides.subtitleLineId,
        startIdx: tokenOverrides.startIdx,
        endIdx: tokenOverrides.endIdx,
        tokens: tokenOverrides.tokens,
      })
      .from(tokenOverrides)
      .where(and(
        eq(tokenOverrides.userId, userId),
        inArray(tokenOverrides.subtitleLineId, unique.slice(i, i + LOAD_CHUNK)),
      ));
    for (const r of rows) {
      const list = out.get(r.lineId) ?? [];
      list.push({ startIdx: r.startIdx, endIdx: r.endIdx, tokens: r.tokens });
      out.set(r.lineId, list);
    }
  }
  return out;
}

/**
 * Pure: corrected tokens for one line. `tokenSpans` is set only when the line
 * has an applied correction (the UI's "Corrected by you" and the editor need
 * it); absent ⇒ every token is its own original [i, i].
 */
export function correctLine(
  tokens: Token[] | null | undefined,
  overrides: readonly TokenOverride[] | undefined,
): { tokens: Token[]; tokenSpans?: TokenSpan[] } {
  const original = tokens ?? [];
  if (!overrides || overrides.length === 0) return { tokens: original };
  const applied = applyTokenOverridesDetailed(original, overrides);
  if (!applied.spans.some((s) => s.corrected)) return { tokens: original };
  return { tokens: applied.tokens, tokenSpans: applied.spans };
}

/**
 * The single read-side helper: replace `tokens` on each row with the user's
 * corrected tokens (and attach `tokenSpans` where corrected). One query for
 * all the rows' lines; rows without a line id pass through.
 */
export async function withTokenOverrides<R extends { tokens: Token[] | null }>(
  db: DbOrTx,
  userId: string,
  rows: R[],
  lineIdOf: (row: R) => string | null | undefined,
): Promise<(Omit<R, "tokens"> & { tokens: Token[]; tokenSpans?: TokenSpan[] })[]> {
  const ids = rows.map(lineIdOf).filter((x): x is string => !!x);
  const overrides = ids.length > 0 ? await loadTokenOverrides(db, userId, ids) : new Map<string, TokenOverride[]>();
  return rows.map((r) => {
    const id = lineIdOf(r);
    return { ...r, ...correctLine(r.tokens, id ? overrides.get(id) : undefined) };
  });
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

type ParsedToken = {
  surface: string;
  lemma: string;
  reading: string | null;
  pos: string | null;
  /** undefined = resolve from the dictionary; null = "not a dictionary word". */
  wordEntryId: string | null | undefined;
};

type ParsedBody = { startIdx: number; endIdx: number; tokens: ParsedToken[] };

const isStr = (v: unknown): v is string => typeof v === "string";

/** Shape-check and normalize the PUT body. Pure — unit-tested. */
export function parseOverrideBody(body: unknown): { ok: true; value: ParsedBody } | { ok: false; error: string } {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return { ok: false, error: "body must be an object" };
  const { startIdx, endIdx, tokens } = b;
  if (!Number.isInteger(startIdx) || !Number.isInteger(endIdx)) {
    return { ok: false, error: "startIdx and endIdx must be integers" };
  }
  if (!Array.isArray(tokens) || tokens.length === 0) return { ok: false, error: "tokens must be a non-empty array" };
  if (tokens.length > MAX_OVERRIDE_TOKENS) return { ok: false, error: `at most ${MAX_OVERRIDE_TOKENS} tokens` };

  const out: ParsedToken[] = [];
  for (const raw of tokens as unknown[]) {
    const t = raw as Record<string, unknown> | null;
    if (!t || typeof t !== "object" || !isStr(t.surface) || t.surface.length === 0) {
      return { ok: false, error: "every token needs a non-empty surface" };
    }
    for (const f of ["surface", "lemma", "reading", "pos"] as const) {
      const v = t[f];
      if (v !== undefined && v !== null && !isStr(v)) return { ok: false, error: `${f} must be a string` };
      if (isStr(v) && v.length > MAX_TOKEN_FIELD) return { ok: false, error: `${f} is too long` };
    }
    let reading: string | null = null;
    if (isStr(t.reading) && t.reading.trim() !== "") {
      reading = toHiragana(t.reading.trim());
      if (!isHiraganaReading(reading)) return { ok: false, error: "reading must be hiragana" };
    } else if (isKanaOnly(t.surface)) {
      reading = toHiragana(t.surface);
    }
    const id = t.wordEntryId;
    if (id !== undefined && id !== null && !isUuid(id)) return { ok: false, error: "wordEntryId must be a uuid or null" };
    out.push({
      surface: t.surface,
      lemma: isStr(t.lemma) && t.lemma.trim() !== "" ? t.lemma.trim() : t.surface,
      reading,
      pos: isStr(t.pos) && t.pos.trim() !== "" ? t.pos.trim() : null,
      wordEntryId: id as string | null | undefined,
    });
  }
  return { ok: true, value: { startIdx: startIdx as number, endIdx: endIdx as number, tokens: out } };
}

/**
 * Fill wordEntryId where the user gave lemma/reading but no id: the existing
 * dictionary provider, preferring an entry whose reading matches (same rule as
 * the import's resolveWordEntries). An explicit id must exist; null stays null.
 */
async function resolveEntries(
  db: Database,
  language: string,
  tokens: ParsedToken[],
): Promise<{ ok: true; ids: (string | null)[] } | { ok: false; error: string }> {
  const explicit = [...new Set(tokens.map((t) => t.wordEntryId).filter((x): x is string => !!x))];
  if (explicit.length > 0) {
    const found = await db
      .select({ id: wordEntries.id })
      .from(wordEntries)
      .where(inArray(wordEntries.id, explicit));
    if (found.length !== explicit.length) return { ok: false, error: "unknown wordEntryId" };
  }
  const dictionary = getDictionary(language, db);
  const ids = await Promise.all(tokens.map(async (t) => {
    if (t.wordEntryId !== undefined) return t.wordEntryId;
    for (const key of new Set([t.lemma, t.surface])) {
      const hits = await dictionary.lookup(key);
      const hit = hits.find((h) => t.reading && h.reading === t.reading) ?? hits[0];
      if (hit) return hit.id;
    }
    return null;
  }));
  return { ok: true, ids };
}

async function loadLine(db: DbOrTx, lineId: string) {
  const [line] = await db
    .select({ id: subtitleLines.id, tokens: subtitleLines.tokens, language: videos.language })
    .from(subtitleLines)
    .innerJoin(videos, eq(videos.id, subtitleLines.videoId))
    .where(eq(subtitleLines.id, lineId))
    .limit(1);
  return line ?? null;
}

/** Dictionary data for the corrected tokens (so the UI can show new entries). */
async function entriesFor(db: DbOrTx, tokens: Token[]): Promise<Record<string, WordEntryData>> {
  const ids = [...new Set(tokens.map((t) => t.wordEntryId).filter((x): x is string => !!x))];
  if (ids.length === 0) return {};
  const rows = await db
    .select({
      id: wordEntries.id, reading: wordEntries.reading, lemma: wordEntries.lemma,
      definitions: wordEntries.definitions, pos: wordEntries.pos, frequencyRank: wordEntries.frequencyRank,
    })
    .from(wordEntries)
    .where(inArray(wordEntries.id, ids));
  const out: Record<string, WordEntryData> = {};
  for (const e of rows) {
    out[e.id] = {
      reading: e.reading ?? "", lemma: e.lemma, definitions: e.definitions, pos: e.pos ?? "",
      frequencyRank: e.frequencyRank ?? null,
    };
  }
  return out;
}

/** The response of both writes: the line as this user now sees it. */
async function linePayload(db: DbOrTx, userId: string, lineId: string, original: Token[]): Promise<Result> {
  const overrides = await loadTokenOverrides(db, userId, [lineId]);
  const corrected = correctLine(original, overrides.get(lineId));
  return {
    status: 200,
    body: {
      lineId,
      tokens: corrected.tokens,
      tokenSpans: corrected.tokenSpans ?? null,
      wordEntries: await entriesFor(db, corrected.tokens),
    },
  };
}

const overlaps = (a: { startIdx: number; endIdx: number }, b: { startIdx: number; endIdx: number }) =>
  a.startIdx <= b.endIdx && b.startIdx <= a.endIdx;

/**
 * PUT /api/lines/:id/tokens — save a correction of tokens [startIdx, endIdx]
 * for this user. The surfaces must spell the original span (400 otherwise).
 * Existing corrections inside the span are replaced; one that only partly
 * overlaps it is a 400 (reset it first). An override equal to the original
 * tokens is a reset.
 */
export async function putTokenOverride(db: Database, userId: string, lineId: string, body: unknown): Promise<Result> {
  const parsed = parseOverrideBody(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const line = await loadLine(db, lineId);
  if (!line) return { status: 404, body: { error: "line not found" } };
  const original = line.tokens ?? [];
  const { startIdx, endIdx } = parsed.value;

  // Validate the text invariant before any dictionary work.
  const draft: TokenOverride = {
    startIdx,
    endIdx,
    tokens: parsed.value.tokens.map((t) => ({
      surface: t.surface, lemma: t.lemma, reading: t.reading, romaji: null, pos: "", wordEntryId: null,
    })),
  };
  const invalid = validateTokenOverride(original, draft);
  if (invalid) return { status: 400, body: { error: invalid } };

  const resolved = await resolveEntries(db, line.language, parsed.value.tokens);
  if (!resolved.ok) return { status: 400, body: { error: resolved.error } };
  const fallbackPos = original[startIdx]?.pos ?? "unknown";
  const override: TokenOverride = {
    startIdx,
    endIdx,
    tokens: parsed.value.tokens.map((t, i) => ({
      surface: t.surface,
      lemma: t.lemma,
      reading: t.reading,
      romaji: t.reading ? hiraToRomaji(t.reading) : null,
      pos: t.pos ?? fallbackPos,
      wordEntryId: resolved.ids[i] ?? null,
    })),
  };

  const existing = (await loadTokenOverrides(db, userId, [lineId])).get(lineId) ?? [];
  const touched = existing.filter((o) => overlaps(o, override));
  if (touched.some((o) => o.startIdx < startIdx || o.endIdx > endIdx)) {
    return { status: 400, body: { error: "overlaps an existing correction; reset it first" } };
  }

  await db.transaction(async (tx) => {
    if (touched.length > 0) {
      await tx.delete(tokenOverrides).where(and(
        eq(tokenOverrides.userId, userId),
        eq(tokenOverrides.subtitleLineId, lineId),
        inArray(tokenOverrides.startIdx, touched.map((o) => o.startIdx)),
      ));
    }
    if (!isNoopOverride(original, override)) {
      await tx.insert(tokenOverrides).values({
        userId, subtitleLineId: lineId, startIdx, endIdx, tokens: override.tokens,
      });
    }
  });
  return linePayload(db, userId, lineId, original);
}

/**
 * DELETE /api/lines/:id/tokens — reset this user's corrections on the line:
 * those overlapping [startIdx, endIdx ?? startIdx] when given, else all.
 */
export async function deleteTokenOverrides(db: Database, userId: string, lineId: string, body: unknown): Promise<Result> {
  const b = (body ?? {}) as { startIdx?: unknown; endIdx?: unknown };
  const hasStart = b.startIdx !== undefined && b.startIdx !== null;
  if (hasStart && !Number.isInteger(b.startIdx)) return { status: 400, body: { error: "startIdx must be an integer" } };
  if (b.endIdx !== undefined && b.endIdx !== null && (!hasStart || !Number.isInteger(b.endIdx))) {
    return { status: 400, body: { error: "endIdx must be an integer (with startIdx)" } };
  }
  const line = await loadLine(db, lineId);
  if (!line) return { status: 404, body: { error: "line not found" } };

  const where = [eq(tokenOverrides.userId, userId), eq(tokenOverrides.subtitleLineId, lineId)];
  if (hasStart) {
    const start = b.startIdx as number;
    const end = (b.endIdx as number | undefined) ?? start;
    where.push(sql`${tokenOverrides.startIdx} <= ${end} and ${tokenOverrides.endIdx} >= ${start}`);
  }
  await db.delete(tokenOverrides).where(and(...where));
  return linePayload(db, userId, lineId, line.tokens ?? []);
}
