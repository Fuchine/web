// Import registration (T0.7). Auth-agnostic so it's unit-testable; the route
// handles auth and HTTP. Captions are submitted by the browser extension
// (the spike showed server-side caption fetch is gated — see tools/spike).

import { type Database, videos, subtitleLines } from "@fuchine/db";
import type { ImportJob } from "@fuchine/jobs";
import { parseYouTubeId } from "./youtube";

/** Minimal producer shape so this module doesn't depend on bullmq types. */
export interface ImportEnqueuer {
  add(name: string, data: ImportJob): Promise<unknown>;
}

export type CaptionInput = {
  idx?: number;
  startMs?: number;
  endMs?: number;
  text?: string;
};

export type ImportRequest = {
  url?: string;
  title?: string;
  channel?: string;
  durationS?: number;
  language?: string;
  captions?: CaptionInput[];
};

export type ImportResult = { status: number; body: Record<string, unknown> };

function intOr(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? (value as number) : fallback;
}

/**
 * Register a video for import. Dedupes on (source, sourceId) — a video already
 * known is returned as-is (the shared cache). New videos are created pending,
 * their submitted captions persisted, and an import job enqueued.
 */
export async function createImport(
  db: Database,
  queue: ImportEnqueuer,
  req: ImportRequest,
): Promise<ImportResult> {
  if (!req?.url) return { status: 400, body: { error: "url is required" } };

  const sourceId = parseYouTubeId(req.url);
  if (!sourceId) return { status: 400, body: { error: "invalid YouTube URL" } };

  // Shared cache (D1/D3): one row per source video, reused across users.
  const existing = await db.query.videos.findFirst({
    where: (v, { and, eq }) => and(eq(v.source, "youtube"), eq(v.sourceId, sourceId)),
  });
  if (existing) {
    return {
      status: 200,
      body: { videoId: existing.id, status: existing.status, cached: existing.status === "done" },
    };
  }

  const captions = Array.isArray(req.captions) ? req.captions : [];
  const rows = captions
    .map((c, i) => ({
      idx: intOr(c.idx, i),
      tStartMs: Math.max(0, intOr(c.startMs, 0)),
      tEndMs: Math.max(0, intOr(c.endMs, 0)),
      textOriginal: String(c.text ?? "").trim(),
    }))
    .filter((r) => r.textOriginal.length > 0);

  if (rows.length === 0) {
    return {
      status: 422,
      body: { error: "no captions submitted — import from the browser extension" },
    };
  }

  const [video] = await db
    .insert(videos)
    .values({
      source: "youtube",
      sourceId,
      url: req.url,
      title: req.title?.trim() || sourceId,
      channel: req.channel ?? null,
      durationS: Number.isInteger(req.durationS) ? req.durationS : null,
      language: req.language || "ja",
      status: "pending",
    })
    .returning();

  await db
    .insert(subtitleLines)
    .values(rows.map((r) => ({ ...r, videoId: video!.id })))
    .onConflictDoNothing();

  await queue.add("import", { videoId: video!.id });

  return { status: 201, body: { videoId: video!.id, status: "pending", lines: rows.length } };
}
