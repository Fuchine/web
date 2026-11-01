// Gold-set format for the explainLine eval (T3.12).
//
// One JSON object per line (JSONL). The first record MAY be a header
// `{"_meta": {...}}` describing provenance/review status; every other record is
// a GoldItem. Blank lines are ignored.

import type { PartTag, Token } from "../src/contract";

export type GoldExpect = {
  /** Each string must appear inside some breakdown[].surface (whitespace-insensitive). */
  mustMentionInBreakdown?: string[];
  /** None of these may appear anywhere in the explanation (surfaces, glosses, notes, plainTerms). */
  mustNotContain?: string[];
  /** For each key, a breakdown part whose surface contains it must carry one of these tags. */
  tagOf?: Record<string, PartTag | PartTag[]>;
  /** Each group: at least one term must appear (case-insensitive) in the glosses/notes/plainTerms. */
  mustMentionAny?: string[][];
  /** Noise line (♪, SFX): the breakdown must be empty. Default false → it must be non-empty. */
  emptyBreakdown?: boolean;
};

export type GoldItem = {
  id: string;
  /** The trap this item probes (は-vs-が, ている, keigo…) — used to aggregate. */
  topic: string;
  line: string;
  prev?: string | null;
  next?: string | null;
  /** Layer-0 tokens, optional. Production always sends them; without them the hint is empty. */
  tokens?: Token[];
  learningLanguage?: string; // default "ja"
  explanationLanguage?: string; // default "en"
  /** Why this item exists / what a correct answer must get right (for the human reviewer). */
  rationale?: string;
  expect: GoldExpect;
};

export type GoldMeta = {
  status?: string;
  note?: string;
  target?: number;
  [k: string]: unknown;
};

export type GoldSet = { meta: GoldMeta | null; items: GoldItem[] };

const EXPECT_KEYS = new Set([
  "mustMentionInBreakdown",
  "mustNotContain",
  "tagOf",
  "mustMentionAny",
  "emptyBreakdown",
]);

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Parse + validate a JSONL gold set. Throws with the offending line number. */
export function parseGoldSet(text: string): GoldSet {
  let meta: GoldMeta | null = null;
  const items: GoldItem[] = [];
  const ids = new Set<string>();

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = rawLine.trim();
    if (!line) return;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`gold line ${lineNo}: invalid JSON (${(err as Error).message})`);
    }
    if ("_meta" in obj) {
      if (meta || items.length) throw new Error(`gold line ${lineNo}: _meta must be the first record`);
      meta = (obj._meta ?? {}) as GoldMeta;
      return;
    }
    const fail = (msg: string): never => {
      throw new Error(`gold line ${lineNo} (${String(obj.id ?? "?")}): ${msg}`);
    };
    if (typeof obj.id !== "string" || !obj.id) fail("id must be a non-empty string");
    if (ids.has(obj.id as string)) fail("duplicate id");
    if (typeof obj.topic !== "string" || !obj.topic) fail("topic must be a non-empty string");
    if (typeof obj.line !== "string" || !obj.line) fail("line must be a non-empty string");
    if (obj.tokens !== undefined && !Array.isArray(obj.tokens)) fail("tokens must be an array");
    const ex = obj.expect;
    if (!ex || typeof ex !== "object") fail("expect must be an object");
    const e = ex as Record<string, unknown>;
    for (const k of Object.keys(e)) if (!EXPECT_KEYS.has(k)) fail(`unknown expect key "${k}"`);
    if (e.mustMentionInBreakdown !== undefined && !isStringArray(e.mustMentionInBreakdown))
      fail("mustMentionInBreakdown must be string[]");
    if (e.mustNotContain !== undefined && !isStringArray(e.mustNotContain))
      fail("mustNotContain must be string[]");
    if (e.mustMentionAny !== undefined &&
      !(Array.isArray(e.mustMentionAny) && e.mustMentionAny.every((g) => isStringArray(g) && g.length > 0)))
      fail("mustMentionAny must be string[][] with non-empty groups");
    if (e.tagOf !== undefined) {
      if (!e.tagOf || typeof e.tagOf !== "object" || Array.isArray(e.tagOf)) fail("tagOf must be an object");
      for (const [k, v] of Object.entries(e.tagOf as Record<string, unknown>)) {
        if (typeof v !== "string" && !isStringArray(v)) fail(`tagOf["${k}"] must be a tag or tag[]`);
      }
    }
    if (e.emptyBreakdown !== undefined && typeof e.emptyBreakdown !== "boolean")
      fail("emptyBreakdown must be boolean");
    // Every surface assertion must be satisfiable: the span has to be in the line.
    for (const s of [...((e.mustMentionInBreakdown as string[]) ?? []), ...Object.keys((e.tagOf as object) ?? {})]) {
      if (!(obj.line as string).includes(s)) fail(`asserted span "${s}" does not occur in the line`);
    }
    ids.add(obj.id as string);
    items.push(obj as unknown as GoldItem);
  });

  return { meta, items };
}
