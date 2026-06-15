// Import pipeline (ARQUITETURA §4.2). Runs once per video, idempotent.
//
// Primary flow (post-spike): captions are submitted by the browser extension
// and already persisted as subtitle_lines; this job enriches them — layer 0
// (tokens + dictionary) and layer 1 (translation). If no lines exist yet, it
// falls back to a server-side caption fetch (gated for most videos — see
// tools/spike), kept as a best-effort path. Layer 2 (explainLine) is on demand
// in the app, not here.

import { asc, eq } from "drizzle-orm";
import { type Database, videos, subtitleLines } from "@fuchine/db";
import { analyzeLine } from "@fuchine/nlp";
import { createProvider, type LlmProvider, type ProviderName } from "@fuchine/llm";
import type { ImportJob } from "./queue";
import { env } from "./env";

export type Caption = { idx: number; startMs: number; endMs: number; text: string };

/** Injectable seams: caption source (fallback) and translation provider. */
export type ImportDeps = {
  fetchCaptions?: (sourceId: string) => Promise<Caption[]>;
  provider?: LlmProvider;
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

    // --- Layer 0: tokenize + resolve dictionary entries (local, free). ---
    for (const line of lines) {
      const tokens = await analyzeLine(line.textOriginal, video.language, db);
      await db.update(subtitleLines).set({ tokens }).where(eq(subtitleLines.id, line.id));
    }

    // --- Layer 1: batch translation (cheap). Failure degrades, not breaks. ---
    try {
      const provider =
        deps.provider ??
        createProvider({
          provider: env.llmProvider as ProviderName,
          apiKey: env.llmApiKey,
          baseUrl: env.llmBaseUrl,
          model: env.llmModel,
        });
      const translations = await provider.translateBatch(
        lines.map((l) => l.textOriginal),
        { from: video.language, to: "en" },
      );
      for (let i = 0; i < lines.length; i++) {
        await db
          .update(subtitleLines)
          .set({ textTranslation: translations[i] ?? null })
          .where(eq(subtitleLines.id, lines[i]!.id));
      }
    } catch (err) {
      // CONTRATO §3.5: keep the video, leave translations null, still done.
      console.error(`[import] translation failed for ${video.id}:`, err);
    }

    await db.update(videos).set({ status: "done" }).where(eq(videos.id, video.id));
  } catch (err) {
    await db.update(videos).set({ status: "failed" }).where(eq(videos.id, video.id));
    throw err;
  }
}

function loadLines(db: Database, videoId: string) {
  return db
    .select()
    .from(subtitleLines)
    .where(eq(subtitleLines.videoId, videoId))
    .orderBy(asc(subtitleLines.idx));
}
