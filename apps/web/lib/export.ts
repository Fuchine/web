// Deck export (backlog: anki-export; T3.3). Builds Anki-importable TSV from the
// user's mined cards in two presets:
//
//  - "lapis" (default): the 24 fields of the Lapis note type (donkuri/lapis —
//    we only produce data under its field names; no template code is copied),
//    plus a Tags column and a GUID column so re-importing updates notes instead
//    of duplicating them.
//  - "basic": the original 4 columns (Expression, Meaning, Notes, Source).
//
// Text only — D2 forbids storing or attaching audio/video, so the audio and
// picture fields stay empty and the clip ships as a YouTube deep link with a
// timestamp. Every untrusted string is HTML-escaped (the decks are #html:true —
// C1); only the markup generated here (<b>, <ol>, <a>…) is raw.
//
// The pure builders are unit-tested; getDeckCards/getLapisExport do the DB read.

import { and, asc, eq, inArray, isNotNull, ne, or, type SQL } from "drizzle-orm";
import {
  type Database, type Definition, type Token, sentenceCards, subtitleLines, videos, wordEntries,
} from "@fuchine/db";
import { pitchCategories } from "@fuchine/core";
import { kataToHira } from "@fuchine/nlp/client";
import { type ClozeEntry, pickClozeTarget } from "@fuchine/ui/answer";
import { withPitch } from "./dictionary";
import { escapeHtml } from "./html";

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

export type ExportPreset = "lapis" | "basic";
/** "curated" = every card except the T3.6 "mine now, curate later" queue. */
export type ExportFilter = "all" | "curated";

export type ExportOptions = {
  preset: ExportPreset;
  filter: ExportFilter;
  deck: string;
  /** Carry the FSRS state as `fuchine::…` tags (Lapis preset). */
  history: boolean;
  format: "tsv" | "json";
};

export const DEFAULT_DECK = "Fuchine";
const DECK_MAX = 100;

/** Parse the export query string. Unknown values are a 400, not a silent default. */
export function parseExportParams(
  params: URLSearchParams,
): { ok: true; value: ExportOptions } | { ok: false; error: string } {
  const preset = params.get("preset") ?? "lapis";
  if (preset !== "lapis" && preset !== "basic") return { ok: false, error: "preset must be lapis or basic" };
  const filter = params.get("filter") ?? "all";
  if (filter !== "all" && filter !== "curated") return { ok: false, error: "filter must be all or curated" };
  const format = params.get("format") ?? "tsv";
  if (format !== "tsv" && format !== "json") return { ok: false, error: "format must be tsv or json" };
  if (format === "json" && preset !== "lapis") return { ok: false, error: "format=json is only for the lapis preset" };
  const rawDeck = params.get("deck") ?? "";
  if (rawDeck.length > DECK_MAX) return { ok: false, error: `deck must be at most ${DECK_MAX} characters` };
  // A deck name lives on a `#deck:` header line: no control characters.
  const deck = rawDeck.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() || DEFAULT_DECK;
  const h = params.get("history");
  return { ok: true, value: { preset, filter, deck, history: h === "1" || h === "true", format } };
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Deep link back to the clip's start (D2: link, never attached media). */
export function clipUrl(source: string, sourceId: string, startMs: number): string {
  const t = Math.max(0, Math.floor(startMs / 1000));
  if (source === "youtube") {
    return `https://www.youtube.com/watch?v=${sourceId}&t=${t}s`;
  }
  return "";
}

/**
 * Flatten a field for TSV: HTML-escape it (the deck declares `#html:true`, so a
 * subtitle like `<img onerror=…>` imported by one user would otherwise run in
 * another user's Anki webview — C1), then tabs → spaces, newlines → <br>.
 */
export function cell(v: string | null | undefined): string {
  return escapeHtml(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, "<br>");
}

/** Generated markup can't contain a raw tab/newline either (it would break the grid). */
function flat(html: string): string {
  return html.replace(/\t/g, " ").replace(/\r?\n/g, "<br>");
}

/* ------------------------------------------------------------------ */
/* Basic preset (the original 4 columns, kept for back-compat)         */
/* ------------------------------------------------------------------ */

export type DeckCard = {
  text: string; // JP sentence (front)
  translation: string | null;
  notes: string | null;
  source: string; // e.g. "youtube"
  sourceId: string;
  startMs: number;
};

/**
 * Build an Anki-importable TSV. Columns: Expression, Meaning, Notes, Source.
 * The `#`-directive header tells Anki the separator, that fields are HTML, and
 * the column order, so a plain "Import File" maps them without fiddling.
 */
export function buildDeckTsv(cards: DeckCard[]): string {
  const header = ["#separator:tab", "#html:true", "#columns:Expression\tMeaning\tNotes\tSource"];
  const rows = cards.map((c) => {
    const link = clipUrl(c.source, c.sourceId, c.startMs);
    const source = link ? `<a href="${link}">Watch on YouTube</a>` : "";
    return [cell(c.text), cell(c.translation), cell(c.notes), source].join("\t");
  });
  return [...header, ...rows].join("\n") + "\n";
}

/** Cards outside the T3.6 curation queue (notes set, or already reviewed). */
function cardWhere(userId: string, filter: ExportFilter): SQL {
  const own = eq(sentenceCards.userId, userId);
  if (filter === "all") return own;
  return and(own, or(isNotNull(sentenceCards.notes), ne(sentenceCards.state, 0)))!;
}

/** Load the user's mined cards as basic export rows, oldest first. */
export async function getDeckCards(
  db: Database,
  userId: string,
  filter: ExportFilter = "all",
): Promise<DeckCard[]> {
  return db
    .select({
      text: subtitleLines.textOriginal,
      translation: subtitleLines.textTranslation,
      notes: sentenceCards.notes,
      source: videos.source,
      sourceId: videos.sourceId,
      startMs: subtitleLines.tStartMs,
    })
    .from(sentenceCards)
    .innerJoin(subtitleLines, eq(subtitleLines.id, sentenceCards.subtitleLineId))
    .innerJoin(videos, eq(videos.id, sentenceCards.videoId))
    .where(cardWhere(userId, filter))
    .orderBy(asc(sentenceCards.createdAt));
}

/* ------------------------------------------------------------------ */
/* Furigana (Anki syntax: ` 漢字[かんじ]`)                              */
/* ------------------------------------------------------------------ */

const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヵヶ]/;
const KANA = /^[ぁ-ゖァ-ヺー]$/;

/**
 * Anki furigana for one word: the kanji part gets the reading, leading/trailing
 * kana that match the reading stay outside the brackets (食べる/たべる →
 * ` 食[た]べる`). Every ruby segment starts with a space — Anki's furigana
 * filter consumes it, and it marks where the base starts. Words without kanji,
 * or without a reading, come back as plain text. Output is HTML-escaped.
 */
export function furiganaWord(surface: string, reading: string | null | undefined): string {
  const r = kataToHira(reading ?? "");
  if (!r || !KANJI.test(surface)) return escapeHtml(surface);
  const s = [...surface];
  const rd = [...r];
  if (kataToHira(surface) === r) return escapeHtml(surface);
  let pre = 0;
  while (pre < s.length && pre < rd.length && KANA.test(s[pre]!) && kataToHira(s[pre]!) === rd[pre]) pre++;
  let suf = 0;
  while (
    suf < s.length - pre && suf < rd.length - pre &&
    KANA.test(s[s.length - 1 - suf]!) && kataToHira(s[s.length - 1 - suf]!) === rd[rd.length - 1 - suf]
  ) suf++;
  const base = s.slice(pre, s.length - suf).join("");
  const ruby = rd.slice(pre, rd.length - suf).join("");
  if (!base || !ruby) return ` ${escapeHtml(surface)}[${escapeHtml(r)}]`;
  return `${escapeHtml(s.slice(0, pre).join(""))} ${escapeHtml(base)}[${escapeHtml(ruby)}]${escapeHtml(s.slice(s.length - suf).join(""))}`;
}

/**
 * Furigana for a whole line from its tokens; the token at `boldIndex` is
 * wrapped in <b>. A leading space at the very start is dropped.
 */
export function sentenceFurigana(
  tokens: readonly Pick<Token, "surface" | "reading">[],
  boldIndex: number | null,
): string {
  const out = tokens
    .map((t, i) => {
      const seg = furiganaWord(t.surface, t.reading);
      // `>` already ends the base for Anki's furigana filter, so the space can go.
      return i === boldIndex ? `<b>${seg.trimStart()}</b>` : seg;
    })
    .join("");
  return out.replace(/^ /, "");
}

/**
 * The line with the target token in <b>. The token is located by walking the
 * tokens through the text (so a repeated word bolds the right occurrence);
 * falls back to the first occurrence of its surface.
 */
export function boldSentence(
  text: string,
  tokens: readonly Pick<Token, "surface">[],
  index: number | null,
): string {
  const target = index == null ? undefined : tokens[index];
  if (!target || !target.surface) return cell(text);
  let pos = 0;
  for (let i = 0; i < index!; i++) {
    const at = text.indexOf(tokens[i]!.surface, pos);
    if (at >= 0) pos = at + tokens[i]!.surface.length;
  }
  let at = text.indexOf(target.surface, pos);
  if (at < 0) at = text.indexOf(target.surface);
  if (at < 0) return cell(text);
  return `${cell(text.slice(0, at))}<b>${cell(target.surface)}</b>${cell(text.slice(at + target.surface.length))}`;
}

/* ------------------------------------------------------------------ */
/* Dictionary fields                                                   */
/* ------------------------------------------------------------------ */

/** MainDefinition: the first JMdict sense's glosses. */
export function mainDefinition(defs: readonly Definition[]): string {
  return cell(defs[0]?.glosses.join("; ") ?? "");
}

/** Glossary: every sense, as a numbered HTML list. */
export function glossaryHtml(defs: readonly Definition[]): string {
  const items = defs.filter((d) => d.glosses.length > 0);
  if (items.length === 0) return "";
  return `<ol>${items.map((d) => `<li>${cell(d.glosses.join("; "))}</li>`).join("")}</ol>`;
}

/**
 * PitchPosition: the Kanjium downstep numbers, comma-separated (0 = heiban),
 * de-duplicated in source order — the numeric form Lapis reads (Yomitan's
 * `{pitch-accent-positions}`, JL's "Pitch Accent (Numeric)").
 */
export function pitchPositionField(positions: readonly number[]): string {
  return [...new Set(positions.filter((p) => Number.isInteger(p) && p >= 0))].join(",");
}

/** PitchCategories: heiban/atamadaka/nakadaka/odaka, comma-separated (Yomitan's form). */
export function pitchCategoriesField(reading: string, positions: readonly number[]): string {
  if (!reading) return "";
  return pitchCategories(reading, positions).join(",");
}

/** No-data FreqSort value — what Yomitan's `{frequency-harmonic-rank}` writes. */
export const FREQ_SORT_UNKNOWN = 9999999;

/** Frequency: Yomitan-style list (`JMdict: <rank>`); empty when unranked. */
export function frequencyField(rank: number | null | undefined): string {
  if (rank == null) return "";
  return `<ul style="text-align: left;"><li>JMdict: ${rank}</li></ul>`;
}

/** FreqSort: the numeric rank (lower = more frequent), or 9999999 when unranked. */
export function freqSortField(rank: number | null | undefined): string {
  return String(rank ?? FREQ_SORT_UNKNOWN);
}

/* ------------------------------------------------------------------ */
/* FSRS state as tags                                                  */
/* ------------------------------------------------------------------ */

export type ExportFsrs = {
  state: number; // 0 New 1 Learning 2 Review 3 Relearning
  due: Date;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
};

const STATE_NAMES = ["new", "learning", "review", "relearning"];

const round2 = (n: number) => String(Math.round(n * 100) / 100);

/**
 * The card's current FSRS state as hierarchical Anki tags. Anki cannot import
 * FSRS memory state from a text file, so this is a readable, searchable record
 * (`tag:fuchine::due::2026-11-03`), not something Anki schedules from. Due is
 * the UTC calendar day; a new card has no due tag.
 */
export function fsrsTags(f: ExportFsrs): string[] {
  const tags = [`fuchine::state::${STATE_NAMES[f.state] ?? "new"}`];
  if (f.state !== 0) {
    tags.push(
      `fuchine::due::${f.due.toISOString().slice(0, 10)}`,
      `fuchine::stability::${round2(f.stability)}`,
      `fuchine::difficulty::${round2(f.difficulty)}`,
    );
  }
  tags.push(`fuchine::reps::${f.reps}`, `fuchine::lapses::${f.lapses}`);
  return tags;
}

/**
 * A tag-safe piece of text: Anki tags are space-separated, and the note type
 * may render {{Tags}}, so HTML-special characters go too.
 */
export function tagPart(s: string, max = 60): string {
  return [...s.replace(/[\s"'<>&]+/g, "_").replace(/^_+|_+$/g, "")].slice(0, max).join("");
}

/* ------------------------------------------------------------------ */
/* Lapis preset                                                        */
/* ------------------------------------------------------------------ */

/**
 * Lapis field names, in note-type order (donkuri/lapis README, "How to use
 * the card" table, fetched 2026-10-30).
 */
export const LAPIS_FIELDS = [
  "Expression", "ExpressionFurigana", "ExpressionReading", "ExpressionAudio", "SelectionText",
  "MainDefinition", "DefinitionPicture", "Sentence", "SentenceFurigana", "SentenceAudio", "Picture",
  "Glossary", "Hint", "IsWordAndSentenceCard", "IsClickCard", "IsSentenceCard", "IsAudioCard",
  "PitchPosition", "PitchCategories", "Frequency", "FreqSort", "MiscInfo",
] as const;
export type LapisField = (typeof LAPIS_FIELDS)[number];

/** A dictionary entry as the export needs it; `pitch` = downsteps for its reading. */
export type ExportEntry = {
  lemma: string;
  reading: string | null;
  definitions: Definition[];
  frequencyRank: number | null;
  pitch: number[];
};

export type LapisCard = {
  cardId: string;
  sentence: string;
  translation: string | null;
  notes: string | null;
  tokens: Token[];
  source: string;
  sourceId: string;
  startMs: number;
  videoTitle: string;
  channel: string | null;
  fsrs: ExportFsrs;
};

export type LapisNote = {
  guid: string;
  fields: Record<LapisField, string>;
  tags: string[];
};

function clozeEntries(entries: Record<string, ExportEntry>): Record<string, ClozeEntry> {
  const out: Record<string, ClozeEntry> = {};
  for (const [id, e] of Object.entries(entries)) {
    out[id] = { lemma: e.lemma, reading: e.reading ?? "", definitions: e.definitions, frequencyRank: e.frequencyRank };
  }
  return out;
}

/**
 * The card's target word — the same rule as the review Cloze (pickClozeTarget,
 * T3.11): the rarest content token with a dictionary entry by frequency_rank
 * (unranked counts as rarer than any ranked word; ties → longer, then later in
 * the line), falling back to a content word without an entry. Fuchine does not
 * record which word a card was mined for, so this is the deterministic choice.
 */
export function exportTarget(card: Pick<LapisCard, "sentence" | "tokens">, entries: Record<string, ExportEntry>) {
  return pickClozeTarget(card.sentence, card.tokens, clozeEntries(entries));
}

/** One Lapis note: fields (already HTML-safe), tags and a stable GUID. */
export function lapisNote(
  card: LapisCard,
  entries: Record<string, ExportEntry>,
  opts: { history: boolean },
): LapisNote {
  const target = exportTarget(card, entries);
  const entry = target?.wordEntryId ? entries[target.wordEntryId] ?? null : null;
  const lemma = target?.lemma ?? "";
  const reading = kataToHira(
    entry?.reading || (target && target.surface === target.lemma ? target.reading : "") || "",
  );
  const defs = entry?.definitions ?? [];
  const link = clipUrl(card.source, card.sourceId, card.startMs);

  const misc = [
    card.translation ? cell(card.translation) : "",
    card.notes ? cell(card.notes) : "",
    [link ? `<a href="${link}">${cell(card.videoTitle)}</a>` : cell(card.videoTitle), card.channel ? cell(card.channel) : ""]
      .filter(Boolean)
      .join(" · "),
  ].filter(Boolean).join("<br>");

  const fields: Record<LapisField, string> = {
    Expression: target ? cell(lemma) : cell(card.sentence),
    ExpressionFurigana: target ? (reading ? furiganaWord(lemma, reading).trimStart() : cell(lemma)) : "",
    ExpressionReading: cell(reading),
    ExpressionAudio: "", // D1/D2: no media
    SelectionText: "",
    MainDefinition: mainDefinition(defs),
    DefinitionPicture: "",
    Sentence: boldSentence(card.sentence, card.tokens, target?.tokenIndex ?? null),
    SentenceFurigana: card.tokens.length
      ? sentenceFurigana(card.tokens, target?.tokenIndex ?? null)
      : cell(card.sentence),
    SentenceAudio: "", // D1/D2: no media
    Picture: "",
    Glossary: glossaryHtml(defs),
    Hint: "",
    IsWordAndSentenceCard: "",
    IsClickCard: "",
    IsSentenceCard: "x", // Fuchine mines sentence cards
    IsAudioCard: "",
    PitchPosition: entry ? pitchPositionField(entry.pitch) : "",
    PitchCategories: entry ? pitchCategoriesField(reading, entry.pitch) : "",
    Frequency: frequencyField(entry?.frequencyRank),
    FreqSort: freqSortField(entry?.frequencyRank),
    MiscInfo: misc,
  };
  for (const k of LAPIS_FIELDS) fields[k] = flat(fields[k]);

  const tags = ["fuchine"];
  const title = tagPart(card.videoTitle);
  if (title) tags.push(`fuchine::video::${title}`);
  if (opts.history) tags.push(...fsrsTags(card.fsrs));

  return { guid: `fuchine-${card.cardId}`, fields, tags };
}

/**
 * Lapis TSV. Header directives (Anki ≥ 2.1.55): tab separator, HTML fields,
 * the Lapis note type and the deck by name, the column names (they match the
 * Lapis fields, so Anki maps them itself), then which columns are tags and
 * GUID — the GUID (`fuchine-<card id>`) makes a re-import update the same notes.
 */
export function buildLapisTsv(
  cards: LapisCard[],
  entries: Record<string, ExportEntry>,
  opts: { deck: string; history: boolean },
): string {
  const columns = [...LAPIS_FIELDS, "Tags", "GUID"];
  const header = [
    "#separator:tab",
    "#html:true",
    "#notetype:Lapis",
    `#deck:${opts.deck}`,
    `#columns:${columns.join("\t")}`,
    `#tags column:${LAPIS_FIELDS.length + 1}`,
    `#guid column:${LAPIS_FIELDS.length + 2}`,
  ];
  const rows = cards.map((c) => {
    const n = lapisNote(c, entries, opts);
    return [...LAPIS_FIELDS.map((f) => n.fields[f]), n.tags.join(" "), n.guid].join("\t");
  });
  return [...header, ...rows].join("\n") + "\n";
}

/** Load the user's cards + the dictionary data their Lapis notes need, oldest first. */
export async function getLapisExport(
  db: Database,
  userId: string,
  filter: ExportFilter = "all",
): Promise<{ cards: LapisCard[]; entries: Record<string, ExportEntry> }> {
  const rows = await db
    .select({
      cardId: sentenceCards.id,
      sentence: subtitleLines.textOriginal,
      translation: subtitleLines.textTranslation,
      notes: sentenceCards.notes,
      tokens: subtitleLines.tokens,
      source: videos.source,
      sourceId: videos.sourceId,
      startMs: subtitleLines.tStartMs,
      videoTitle: videos.title,
      channel: videos.channel,
      state: sentenceCards.state,
      due: sentenceCards.due,
      stability: sentenceCards.stability,
      difficulty: sentenceCards.difficulty,
      reps: sentenceCards.reps,
      lapses: sentenceCards.lapses,
    })
    .from(sentenceCards)
    .innerJoin(subtitleLines, eq(subtitleLines.id, sentenceCards.subtitleLineId))
    .innerJoin(videos, eq(videos.id, sentenceCards.videoId))
    .where(cardWhere(userId, filter))
    .orderBy(asc(sentenceCards.createdAt), asc(sentenceCards.id));

  const cards: LapisCard[] = rows.map((r) => ({
    cardId: r.cardId, sentence: r.sentence, translation: r.translation, notes: r.notes,
    tokens: r.tokens ?? [], source: r.source, sourceId: r.sourceId, startMs: r.startMs,
    videoTitle: r.videoTitle, channel: r.channel,
    fsrs: { state: r.state, due: r.due, stability: r.stability, difficulty: r.difficulty, reps: r.reps, lapses: r.lapses },
  }));

  // Every entry the cards' tokens point to (the target choice needs their ranks).
  const ids = [...new Set(cards.flatMap((c) => c.tokens.map((t) => t.wordEntryId)).filter((x): x is string => !!x))];
  const entryRows: { id: string; language: string; lemma: string; reading: string | null; definitions: Definition[]; frequencyRank: number | null }[] = [];
  for (let i = 0; i < ids.length; i += 5000) {
    entryRows.push(
      ...(await db
        .select({
          id: wordEntries.id, language: wordEntries.language, lemma: wordEntries.lemma,
          reading: wordEntries.reading, definitions: wordEntries.definitions,
          frequencyRank: wordEntries.frequencyRank,
        })
        .from(wordEntries)
        .where(inArray(wordEntries.id, ids.slice(i, i + 5000)))),
    );
  }
  const entries: Record<string, ExportEntry> = {};
  for (const e of entryRows) {
    entries[e.id] = { lemma: e.lemma, reading: e.reading, definitions: e.definitions, frequencyRank: e.frequencyRank, pitch: [] };
  }

  // Pitch only for the entries that end up as a target word.
  const targetIds = new Set(cards.map((c) => exportTarget(c, entries)?.wordEntryId).filter((x): x is string => !!x));
  const withP = await withPitch(db, entryRows.filter((e) => targetIds.has(e.id)));
  for (const e of withP) entries[e.id]!.pitch = e.pitch.flatMap((p) => p.positions);

  return { cards, entries };
}
