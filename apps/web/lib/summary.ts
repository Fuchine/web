// Review session summary (T2.x). Auth-agnostic and testable; the route adds auth.
// A "session" is resolved from timestamps rather than a session_id column: either
// an explicit `since` (passed by ReviewSession on finish) or, as a fallback, the
// most recent contiguous burst of reviews (gap-based sessionization). This keeps
// the summary working with no schema change; a real session_id can replace it later.

import { and, count, eq, gte, sql } from "drizzle-orm";
import {
  type Database,
  reviewLogs,
  sentenceCards,
  subtitleLines,
  wordEntries,
} from "@fuchine/db";
import type { Token } from "@fuchine/db";
import { computeStreaks, dayKey } from "./stats";

const DAY_MS = 86_400_000;
const SESSION_GAP_MS = 30 * 60 * 1000; // reviews >30 min apart start a new session
const MATURED_LIMIT = 5;

export interface SessionSummary {
  cardsReviewed: number;
  timeLabel: string; // m:ss span of the session
  retentionPct: number;
  streak: number; // current day streak
  grades: { again: number; hard: number; good: number; easy: number };
  week: boolean[]; // last 7 calendar days (Mon→Sun), true = reviewed that day
  matured: { word: string; reading: string; gloss: string }[];
}

const EMPTY: SessionSummary = {
  cardsReviewed: 0,
  timeLabel: "0:00",
  retentionPct: 0,
  streak: 0,
  grades: { again: 0, hard: 0, good: 0, easy: 0 },
  week: [false, false, false, false, false, false, false],
  matured: [],
};

function fmtSpan(ms: number): string {
  const totalS = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The last token carrying a dictionary entry — matches the review cloze target heuristic. */
function targetToken(tokens: Token[]): Token | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].wordEntryId) return tokens[i];
  }
  return null;
}

/**
 * Resolve the session start. Given an explicit `since`, use it. Otherwise walk
 * back from the most recent review while consecutive gaps stay under SESSION_GAP_MS.
 * Returns null when the user has no reviews at all.
 */
export function resolveSessionStart(
  reviewTimes: Date[],
  since?: Date | null,
): Date | null {
  if (since && !Number.isNaN(since.getTime())) return since;
  if (reviewTimes.length === 0) return null;
  const desc = [...reviewTimes].sort((a, b) => b.getTime() - a.getTime());
  let start = desc[0];
  for (let i = 1; i < desc.length; i++) {
    if (start.getTime() - desc[i].getTime() <= SESSION_GAP_MS) start = desc[i];
    else break;
  }
  return start;
}

export async function getSessionSummary(
  db: Database,
  userId: string,
  sinceIso?: string,
): Promise<SessionSummary> {
  // Timestamps for the last 400 days: enough for sessionization + streak + week.
  const recent = await db
    .select({ at: reviewLogs.reviewedAt })
    .from(reviewLogs)
    .where(
      and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, new Date(Date.now() - 400 * DAY_MS))),
    );
  if (recent.length === 0) return EMPTY;

  const times = recent.map((r) => r.at);
  const since = resolveSessionStart(
    times,
    sinceIso ? new Date(sinceIso) : null,
  );
  if (!since) return EMPTY;

  // --- Grade breakdown + session span, from reviews in the window. ---
  const gradeRows = await db
    .select({ grade: reviewLogs.grade, n: count(), cards: sql<number>`count(distinct ${reviewLogs.cardId})` })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, since)))
    .groupBy(reviewLogs.grade);

  const grades = { again: 0, hard: 0, good: 0, easy: 0 };
  let total = 0;
  let ok = 0;
  let cardsReviewed = 0;
  for (const r of gradeRows) {
    const n = Number(r.n);
    total += n;
    cardsReviewed += Number(r.cards);
    if (r.grade === 1) grades.again += n;
    else if (r.grade === 2) grades.hard += n;
    else if (r.grade === 3) grades.good += n;
    else if (r.grade === 4) grades.easy += n;
    if (r.grade >= 3) ok += n;
  }
  const retentionPct = total ? Math.round((ok / total) * 100) : 0;

  // Session span: first→last review inside the window.
  const windowTimes = times.filter((t) => t.getTime() >= since.getTime());
  const spanMs =
    windowTimes.length > 1
      ? Math.max(...windowTimes.map((t) => t.getTime())) -
        Math.min(...windowTimes.map((t) => t.getTime()))
      : 0;

  // --- Streak + week from all review day keys (JS-local, consistent with Stats). ---
  const dayKeys = times.map((t) => dayKey(t));
  const { current: streak } = computeStreaks(dayKeys);
  const keySet = new Set(dayKeys);
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7; // 0 = Monday
  const week: boolean[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (todayDow - dow));
    week.push(keySet.has(dayKey(d)));
  }

  // --- Words matured: cards that reached Review state during this session. ---
  const maturedCards = await db
    .select({ tokens: subtitleLines.tokens })
    .from(sentenceCards)
    .innerJoin(subtitleLines, eq(subtitleLines.id, sentenceCards.subtitleLineId))
    .where(
      and(
        eq(sentenceCards.userId, userId),
        eq(sentenceCards.state, 2),
        gte(sentenceCards.lastReview, since),
      ),
    )
    .limit(MATURED_LIMIT * 2);

  const targets = maturedCards
    .map((c) => targetToken(c.tokens))
    .filter((t): t is Token => t !== null);
  const entryIds = [...new Set(targets.map((t) => t.wordEntryId!))];
  const glossById = new Map<string, string>();
  if (entryIds.length > 0) {
    const entries = await db
      .select({ id: wordEntries.id, definitions: wordEntries.definitions })
      .from(wordEntries)
      .where(sql`${wordEntries.id} = ANY(${sql`ARRAY[${sql.join(entryIds.map((id) => sql`${id}::uuid`), sql`, `)}]`})`);
    for (const e of entries) {
      glossById.set(e.id, e.definitions[0]?.glosses?.join("; ") ?? "");
    }
  }

  const seen = new Set<string>();
  const matured: SessionSummary["matured"] = [];
  for (const t of targets) {
    if (seen.has(t.wordEntryId!)) continue;
    seen.add(t.wordEntryId!);
    matured.push({
      word: t.surface,
      reading: t.reading ?? "",
      gloss: glossById.get(t.wordEntryId!) ?? "",
    });
    if (matured.length >= MATURED_LIMIT) break;
  }

  return {
    cardsReviewed,
    timeLabel: fmtSpan(spanMs),
    retentionPct,
    streak,
    grades,
    week,
    matured,
  };
}
