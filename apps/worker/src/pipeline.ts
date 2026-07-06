// Import pipeline (ARQUITETURA §4.2). Runs once per video, idempotent.
//
// Primary flow (post-spike): captions are submitted by the browser extension
// and already persisted as subtitle_lines; this job enriches them — layer 0
// (tokens). Layer-1 translation is no longer done here — it runs lazily per
// chunk in the web app as the user watches (see apps/web/lib/translate.ts).
// If no lines exist yet, it falls back to a server-side caption fetch (gated
// for most videos — see tools/spike), kept as a best-effort path. Layer 2
// (explainLine) is on demand in the app, not here.

import { asc, eq } from "drizzle-orm";
import { type Database, videos, subtitleLines, wordExamples, wordEntries } from "@fuchine/db";
import { inArray } from "drizzle-orm";
import { analyzeLine } from "@fuchine/nlp";
import type { ImportJob } from "./queue";
import { estimateLevel } from "./level";
import { checkEmbeddable } from "./embeddable";
import { classifyCategory } from "./category";

export type Caption = { idx: number; startMs: number; endMs: number; text: string };

/** Injectable seam: caption source (fallback) + embeddability probe. */
export type ImportDeps = {
  fetchCaptions?: (sourceId: string) => Promise<Caption[]>;
  checkEmbeddable?: (sourceId: string) => Promise<boolean | null>;
};

/**
 * Server-side caption fetch (D1). The spike showed this is gated for most
 * videos; kept as a best-effort fallback when the extension hasn't supplied
 * captions. Returns ordered lines.
 */
async function defaultFetchCaptions(_sourceId: string): Promise<Caption[]> {
  // TODO(import): best-effort fetch (needs cookies / PO token). Usually empty.
  return [];
}

export async function importVideo(
  db: Database,
  job: ImportJob,
  deps: ImportDeps = {},
): Promise<void> {
  const fetchCaptions = deps.fetchCaptions ?? defaultFetchCaptions;
  const probeEmbeddable = deps.checkEmbeddable ?? checkEmbeddable;

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, job.videoId))
    .limit(1);
  if (!video) throw new Error(`Video ${job.videoId} not found`);

  await db.update(videos).set({ status: "processing" }).where(eq(videos.id, video.id));

  try {
    let lines = await loadLines(db, video.id);

    // Fallback: no captions submitted — try a server-side fetch.
    if (lines.length === 0) {
      const captions = await fetchCaptions(video.sourceId);
      if (captions.length > 0) {
        await db
          .insert(subtitleLines)
          .values(
            captions.map((c) => ({
              videoId: video.id,
              idx: c.idx,
              tStartMs: c.startMs,
              tEndMs: c.endMs,
              textOriginal: c.text,
            })),
          )
          .onConflictDoNothing();
        lines = await loadLines(db, video.id);
      }
    }

    // --- Layer 0: tokenize + resolve dictionary entries (local, free). Also
    // record where each resolved word occurs, for the dictionary's "From your
    // videos" — deduped per line; the unique index dedupes across re-runs. ---
    const exampleRows: { wordEntryId: string; subtitleLineId: string; videoId: string }[] = [];
    for (const line of lines) {
      const tokens = await analyzeLine(line.textOriginal, video.language, db);
      await db.update(subtitleLines).set({ tokens }).where(eq(subtitleLines.id, line.id));
      const seen = new Set<string>();
      for (const t of tokens) {
        if (t.wordEntryId && !seen.has(t.wordEntryId)) {
          seen.add(t.wordEntryId);
          exampleRows.push({ wordEntryId: t.wordEntryId, subtitleLineId: line.id, videoId: video.id });
        }
      }
    }
    if (exampleRows.length > 0) {
      await db.insert(wordExamples).values(exampleRows).onConflictDoNothing();
    }

    const levelEstimate = await estimateVideoLevel(db, exampleRows.map((r) => r.wordEntryId));

    // Probe once (skip if already known) so the library can flag dead players.
    const embeddable =
      video.embeddable == null ? await probeEmbeddable(video.sourceId) : video.embeddable;
    // Best-guess category (heuristic); keep any existing one.
    const category = video.category ?? classifyCategory(video.title, video.channel);

    await db
      .update(videos)
      .set({ status: "done", levelEstimate, embeddable, category })
      .where(eq(videos.id, video.id));
  } catch (err) {
    await db.update(videos).set({ status: "failed" }).where(eq(videos.id, video.id));
    throw err;
  }
}

/** Median frequency rank of the video's distinct words → beginner/intermediate/advanced. */
export async function estimateVideoLevel(db: Database, wordEntryIds: string[]) {
  const unique = [...new Set(wordEntryIds)];
  if (unique.length === 0) return null;
  const rows = await db
    .select({ frequencyRank: wordEntries.frequencyRank })
    .from(wordEntries)
    .where(inArray(wordEntries.id, unique));
  return estimateLevel(rows.map((r) => r.frequencyRank));
}

function loadLines(db: Database, videoId: string) {
  return db
    .select()
    .from(subtitleLines)
    .where(eq(subtitleLines.videoId, videoId))
    .orderBy(asc(subtitleLines.idx));
}
