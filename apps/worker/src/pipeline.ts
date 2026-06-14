// Import pipeline (ARQUITETURA §4.2). Runs once per video, idempotent:
// re-running a job must not duplicate rows. Layer 2 (explainLine) is on
// demand in the app, not here.

import { and, eq } from "drizzle-orm";
import { type Database, videos, subtitleLines } from "@fuchine/db";
import { analyzeLine } from "@fuchine/nlp";
import { createProvider, type LlmProvider, type ProviderName } from "@fuchine/llm";
import type { ImportJob } from "./queue";
import { env } from "./env";

export type Caption = { idx: number; startMs: number; endMs: number; text: string };

/** Injectable seams: caption source and translation provider (testability). */
export type ImportDeps = {
  fetchCaptions?: (sourceId: string) => Promise<Caption[]>;
  provider?: LlmProvider;
};

/**
 * Fetch the Japanese caption track + metadata via official YouTube channels (D1).
 * F0 placeholder — wire the captions spike here. Returns ordered lines.
 */
async function defaultFetchCaptions(_sourceId: string): Promise<Caption[]> {
  // TODO(import): YouTube metadata + JP caption track. Never store media (D1).
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

  await db
    .update(videos)
    .set({ status: "processing" })
    .where(eq(videos.id, video.id));

  try {
    const captions = await fetchCaptions(video.sourceId);

    // --- Layer 0: tokenize + resolve dictionary entries locally (free). ---
    const rows = [];
    for (const c of captions) {
      rows.push({
        videoId: video.id,
        idx: c.idx,
        tStartMs: c.startMs,
        tEndMs: c.endMs,
        textOriginal: c.text,
        tokens: await analyzeLine(c.text, video.language, db),
      });
    }
    if (rows.length > 0) {
      // Idempotent: unique (video_id, idx) means a replay is a no-op.
      await db.insert(subtitleLines).values(rows).onConflictDoNothing();
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
        captions.map((c) => c.text),
        { from: video.language, to: "en" },
      );
      await Promise.all(
        captions.map((c, i) =>
          db
            .update(subtitleLines)
            .set({ textTranslation: translations[i] ?? null })
            .where(
              and(
                eq(subtitleLines.videoId, video.id),
                eq(subtitleLines.idx, c.idx),
              ),
            ),
        ),
      );
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
