// Automatic checks for one explainLine output (T3.12). Pure functions over the
// model's *raw* response text: they run the same parse + coercion production
// uses (extractJson → coerceExplanation) and also measure what coercion had to
// throw away. No human needed per run; the gold file's `expect` adds per-item
// assertions on top.

import type { Explanation, PartTag } from "../src/contract";
import { coerceExplanation, extractJson } from "../src/providers/openai-compatible";
import type { GoldItem } from "./gold";

export type CheckName =
  | "json_valid"
  | "no_coercion_loss"
  | "breakdown_shape"
  | "surfaces_in_line"
  | "single_accent"
  | "no_romaji"
  | "fields_non_empty"
  | "plain_terms_language"
  | "expect_mention_in_breakdown"
  | "expect_not_contain"
  | "expect_tag_of"
  | "expect_mention_any";

export type CheckResult = { name: CheckName; pass: boolean; detail?: string };

export type ItemOutput = {
  /** The model's response content, verbatim. null when the call itself failed. */
  raw: string | null;
  /** Transport/provider error, if any (network, 4xx/5xx, rate limit). */
  error?: string;
};

export type ItemResult = {
  id: string;
  topic: string;
  line: string;
  /** The call failed before producing content — counted separately from quality failures. */
  errored: boolean;
  error?: string;
  pass: boolean;
  checks: CheckResult[];
  raw: string | null;
  explanation: Explanation | null;
};

// Mirrors PART_TAGS in providers/openai-compatible.ts (the coercion target).
const PART_TAGS = [
  "noun", "verb", "adjective", "adverb", "particle", "grammar", "expression",
] as const satisfies readonly PartTag[];
const MAX_BREAKDOWN_PARTS = 8;
const PART_KEYS = new Set(["surface", "tag", "gloss", "note", "accent"]);
const TOP_KEYS = new Set(["breakdown", "plainTerms"]);

/* ------------------------------ text utils ------------------------------ */

/** Whitespace-insensitive, width-insensitive form used for span matching. */
export function normalizeSpan(s: string): string {
  return s.normalize("NFKC").replace(/[\s　]+/g, "");
}

/**
 * Does a breakdown surface occur in the line? Tolerates spacing
 * ("歩いて います"), a leading/trailing 〜 marker, and discontinuous patterns
 * written with 〜/…  ("ば〜ほど"): each segment must occur, in order.
 */
export function surfaceOccursIn(surface: string, line: string): boolean {
  const l = normalizeSpan(line);
  const segments = normalizeSpan(surface)
    .split(/[〜~～…]+|\.\.\./)
    .filter((s) => s.length > 0);
  if (segments.length === 0) return false;
  let from = 0;
  for (const seg of segments) {
    const at = l.indexOf(seg, from);
    if (at < 0) return false;
    from = at + seg.length;
  }
  return true;
}

const JA_CHARS = /[぀-ヿ㐀-鿿ｦ-ﾟ]/g;
const LATIN_CHARS = /[A-Za-zÀ-ÿ]/g;

// Romanized Japanese that has no business in an English explanation. The
// prompt forbids romaji (readings come from layer-0 tokens; CONTRATO §8.2).
const ROMAJI_WORDS = new Set([
  "wa", "ga", "wo", "desu", "deshita", "masu", "mashita", "masen", "mashou",
  "janai", "jan", "chau", "chatta", "jau", "teiru", "teimasu", "kudasai",
  "watashi", "boku", "anata", "kara", "dake", "shika", "nai", "nakatta", "yoku",
  "sugoi", "kawaii", "itadakimasu", "gozaimasu", "irasshaimase", "nda", "ndesu",
]);
const ROMAJI_SUFFIX =
  /\b[a-z]{2,}(?:imasu|emasu|shimasu|mashita|masen|mashou|teiru|teimasu|nakatta|rareru|saseru|sareru|chatta|jatta|chau|tari)\b/i;
/** A kana/kanji span followed by a parenthesized latin reading: "は (wa)". */
const PAREN_READING = /[぀-ヿ㐀-鿿]\s*[(（]\s*[a-z][a-z\s'-]*[)）]/i;
// Latin strings that are both valid romaji and common English — never flagged
// even when a token's romaji matches.
const ENGLISH_HOMOGRAPHS = new Set([
  "made", "ore", "sake", "to", "no", "de", "ni", "mo", "he", "a", "i", "o",
  "e", "kun", "hai", "tea", "date", "hide", "mine", "sure", "tame", "dame",
]);

/** Romaji findings in a block of explanation prose. */
export function findRomaji(text: string, tokenRomaji: string[] = []): string[] {
  const found = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z]+(?:-[a-z]+)?/g) ?? []) {
    if (ROMAJI_WORDS.has(w)) found.add(w);
  }
  const suf = ROMAJI_SUFFIX.exec(text);
  if (suf) found.add(suf[0].toLowerCase());
  const paren = PAREN_READING.exec(text);
  if (paren) found.add(paren[0]);
  for (const r of tokenRomaji) {
    const w = r.toLowerCase().trim();
    if (w.length < 3 || ENGLISH_HOMOGRAPHS.has(w) || !/^[a-z]+$/.test(w)) continue;
    if (new RegExp(`\\b${w}\\b`, "i").test(text)) found.add(w);
  }
  return [...found];
}

// Distinctive function words per language (overlapping ones like de/que/no/se
// are left out on purpose). Enough to tell en from pt/es prose.
const STOPWORDS: Record<string, string[]> = {
  en: ["the", "is", "and", "of", "this", "that", "with", "you", "are", "it", "here", "which", "means"],
  pt: ["não", "é", "você", "uma", "do", "da", "os", "um", "com", "isso", "também", "está", "frase"],
  es: ["el", "los", "las", "es", "una", "del", "está", "también", "pero", "muy", "y", "por", "frase"],
};
const LATIN_LANGS = new Set(["en", "pt", "es", "fr", "de", "it"]);

/** Is `text` written in `lang`? Script ratio first, then stopword vote. */
export function checkLanguage(text: string, lang: string): { pass: boolean; detail?: string } {
  const ja = (text.match(JA_CHARS) ?? []).length;
  const latin = (text.match(LATIN_CHARS) ?? []).length;
  if (lang === "ja") {
    const ratio = ja / Math.max(1, ja + latin);
    return ratio >= 0.5 ? { pass: true } : { pass: false, detail: `only ${Math.round(ratio * 100)}% Japanese script` };
  }
  if (!LATIN_LANGS.has(lang)) return { pass: true, detail: `language "${lang}" not checked` };
  const ratio = latin / Math.max(1, ja + latin);
  if (ratio < 0.6) return { pass: false, detail: `only ${Math.round(ratio * 100)}% Latin script` };
  const words = text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? [];
  const score = (l: string) => words.filter((w) => STOPWORDS[l]?.includes(w)).length;
  const scores = Object.keys(STOPWORDS).map((l) => [l, score(l)] as const);
  const best = scores.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (STOPWORDS[lang] && best[1] > 0 && best[0] !== lang && best[1] > score(lang)) {
    return { pass: false, detail: `reads as "${best[0]}", expected "${lang}"` };
  }
  return { pass: true };
}

/* ------------------------------ the checks ------------------------------ */

/** What coercion dropped or rewrote, given the parsed raw object. */
export function coercionLoss(parsed: unknown): string[] {
  const loss: string[] = [];
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return ["top level is not a JSON object"];
  }
  const obj = parsed as Record<string, unknown>;
  for (const k of Object.keys(obj)) if (!TOP_KEYS.has(k)) loss.push(`unknown top-level key "${k}" dropped`);
  if (typeof obj.plainTerms !== "string") loss.push("plainTerms missing or not a string");
  if (!Array.isArray(obj.breakdown)) {
    loss.push("breakdown missing or not an array");
    return loss;
  }
  if (obj.breakdown.length > MAX_BREAKDOWN_PARTS) {
    loss.push(`${obj.breakdown.length - MAX_BREAKDOWN_PARTS} part(s) beyond ${MAX_BREAKDOWN_PARTS} truncated`);
  }
  obj.breakdown.slice(0, MAX_BREAKDOWN_PARTS).forEach((p, i) => {
    if (!p || typeof p !== "object") {
      loss.push(`part ${i} is not an object`);
      return;
    }
    const g = p as Record<string, unknown>;
    if (typeof g.surface !== "string" || g.surface.length === 0) loss.push(`part ${i} dropped (no surface)`);
    if (typeof g.tag !== "string" || !(PART_TAGS as readonly string[]).includes(g.tag)) {
      loss.push(`part ${i} tag ${JSON.stringify(g.tag)} coerced to "expression"`);
    }
    for (const f of ["gloss", "note"] as const) {
      if (typeof g[f] !== "string") loss.push(`part ${i} ${f} missing or not a string`);
    }
    if (g.accent !== undefined && typeof g.accent !== "boolean") loss.push(`part ${i} accent is not a boolean`);
    for (const k of Object.keys(g)) if (!PART_KEYS.has(k)) loss.push(`part ${i} unknown key "${k}" dropped`);
  });
  return loss;
}

function allProse(ex: Explanation): string {
  return [...ex.breakdown.flatMap((p) => [p.gloss, p.note]), ex.plainTerms].join("\n");
}

function allText(ex: Explanation): string {
  return [...ex.breakdown.flatMap((p) => [p.surface, p.gloss, p.note]), ex.plainTerms].join("\n");
}

const ok = (name: CheckName, detail?: string): CheckResult => ({ name, pass: true, detail });
const bad = (name: CheckName, detail: string): CheckResult => ({ name, pass: false, detail });

/** Run every automatic + expected check for one gold item against one output. */
export function evaluateItem(item: GoldItem, out: ItemOutput): ItemResult {
  const base = { id: item.id, topic: item.topic, line: item.line, raw: out.raw };
  if (out.raw === null) {
    return {
      ...base,
      errored: true,
      error: out.error ?? "no response",
      pass: false,
      checks: [],
      explanation: null,
    };
  }

  const checks: CheckResult[] = [];
  let parsed: unknown;
  try {
    parsed = extractJson(out.raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    checks.push(ok("json_valid"));
  } catch {
    checks.push(bad("json_valid", "response is not a JSON object"));
    return { ...base, errored: false, pass: false, checks, explanation: null };
  }

  const loss = coercionLoss(parsed);
  checks.push(loss.length ? bad("no_coercion_loss", loss.join("; ")) : ok("no_coercion_loss"));

  const ex = coerceExplanation(parsed);
  const lang = item.explanationLanguage ?? "en";
  const expectEmpty = item.expect.emptyBreakdown === true;

  // Shape: noise lines must come back empty; real lines must have 1..8 parts.
  if (expectEmpty) {
    checks.push(ex.breakdown.length === 0
      ? ok("breakdown_shape")
      : bad("breakdown_shape", `expected an empty breakdown for a noise line, got ${ex.breakdown.length} part(s)`));
  } else {
    checks.push(ex.breakdown.length > 0
      ? ok("breakdown_shape")
      : bad("breakdown_shape", "empty breakdown for a real sentence"));
  }

  const outside = ex.breakdown.filter((p) => !surfaceOccursIn(p.surface, item.line)).map((p) => p.surface);
  checks.push(outside.length
    ? bad("surfaces_in_line", `not in the line: ${outside.map((s) => `「${s}」`).join(", ")}`)
    : ok("surfaces_in_line"));

  const accents = ex.breakdown.filter((p) => p.accent).length;
  checks.push(accents <= 1 ? ok("single_accent") : bad("single_accent", `${accents} parts marked accent`));

  const tokenRomaji = (item.tokens ?? []).map((t) => t.romaji ?? "").filter(Boolean);
  const romaji = lang === "ja" ? [] : findRomaji(allProse(ex), tokenRomaji);
  checks.push(romaji.length ? bad("no_romaji", `found: ${romaji.join(", ")}`) : ok("no_romaji"));

  const emptyFields = ex.breakdown.flatMap((p) => [
    ...(p.gloss.trim() ? [] : [`gloss of 「${p.surface}」`]),
    ...(p.note.trim() ? [] : [`note of 「${p.surface}」`]),
  ]);
  if (!ex.plainTerms.trim()) emptyFields.push("plainTerms");
  checks.push(emptyFields.length ? bad("fields_non_empty", `empty: ${emptyFields.join(", ")}`) : ok("fields_non_empty"));

  const langCheck = ex.plainTerms.trim()
    ? checkLanguage(ex.plainTerms, lang)
    : { pass: false, detail: "plainTerms is empty" };
  checks.push({ name: "plain_terms_language", ...langCheck });

  // ---- per-item expected assertions (from the gold file) ----
  const e = item.expect;
  if (e.mustMentionInBreakdown?.length) {
    const missing = e.mustMentionInBreakdown.filter(
      (s) => !ex.breakdown.some((p) => normalizeSpan(p.surface).includes(normalizeSpan(s))),
    );
    checks.push(missing.length
      ? bad("expect_mention_in_breakdown", `no part covers: ${missing.map((s) => `「${s}」`).join(", ")}`)
      : ok("expect_mention_in_breakdown"));
  }

  if (e.mustNotContain?.length) {
    const text = normalizeSpan(allText(ex)).toLowerCase();
    const hits = e.mustNotContain.filter((s) => text.includes(normalizeSpan(s).toLowerCase()));
    checks.push(hits.length
      ? bad("expect_not_contain", `contains: ${hits.map((s) => `「${s}」`).join(", ")}`)
      : ok("expect_not_contain"));
  }

  if (e.tagOf && Object.keys(e.tagOf).length) {
    // A part whose surface IS the span is judged strictly; otherwise the parts
    // containing it are (see the kana-only exception below — the prompt allows
    // merging particles into neighbors, 象は / パンを).
    const problems: string[] = [];
    const notes: string[] = [];
    for (const [span, want] of Object.entries(e.tagOf)) {
      const accepted = Array.isArray(want) ? want : [want];
      const key = normalizeSpan(span);
      const exact = ex.breakdown.filter((p) => normalizeSpan(p.surface) === key);
      const merged = ex.breakdown.filter((p) => normalizeSpan(p.surface).includes(key));
      if (exact.length > 0) {
        if (!exact.some((p) => accepted.includes(p.tag))) {
          problems.push(`「${span}」 tagged ${exact.map((p) => p.tag).join("/")}, want ${accepted.join("|")}`);
        }
      } else if (merged.length > 0) {
        if (!merged.some((p) => accepted.includes(p.tag))) {
          // Kana-only spans are particles/endings folded into a neighbor (パンを):
          // the tag belongs to the neighbor. A content span (食べ in 食べます)
          // is the same word inflected, so its tag is judged.
          if (/^[぀-ゟ]+$/.test(key)) {
            notes.push(`「${span}」 merged into 「${merged[0]!.surface}」 (${merged[0]!.tag}), not judged`);
          } else {
            problems.push(`「${span}」 tagged ${merged.map((p) => p.tag).join("/")}, want ${accepted.join("|")}`);
          }
        }
      } else {
        problems.push(`no part covers 「${span}」`);
      }
    }
    checks.push(problems.length
      ? bad("expect_tag_of", [...problems, ...notes].join("; "))
      : ok("expect_tag_of", notes.length ? notes.join("; ") : undefined));
  }

  if (e.mustMentionAny?.length) {
    const prose = allProse(ex).toLowerCase();
    const unmet = e.mustMentionAny.filter((group) => !group.some((t) => prose.includes(t.toLowerCase())));
    checks.push(unmet.length
      ? bad("expect_mention_any", `none of: ${unmet.map((g) => `[${g.join(" | ")}]`).join("; ")}`)
      : ok("expect_mention_any"));
  }

  return {
    ...base,
    errored: false,
    pass: checks.every((c) => c.pass),
    checks,
    explanation: ex,
  };
}
