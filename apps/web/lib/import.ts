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

// Caps on the extension payload — it runs on the user's machine, so it's user
// input (mirrors the explicit caps on the progress beacon in lib/progress.ts).
export const CAPTIONS_MAX = 10_000; // a 3h video is ~3k lines; 10k is generous
export const TEXT_MAX = 500; // per caption line; longer is bad data, truncate
export const TITLE_MAX = 300;
export const CHANNEL_MAX = 200;
const DURATION_S_MAX = 43_200; // 12h

function intOr(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? (value as number) : fallback;
}

export type NormalizedCaption = {
  idx: number;
  tStartMs: number;
  tEndMs: number;
  textOriginal: string;
};

export type ValidatedImport = {
  url: string;
  sourceId: string;
  title: string;
  channel: string | null;
  durationS: number | null;
  language: string;
  rows: NormalizedCaption[];
};

export type ValidationError = { ok: false; status: number; error: string };

/**
 * Validate + normalize an import request from the extension. Pure and testable:
 * enforces the payload caps, normalizes captions (trim, drop empties, truncate
 * overlong text, swap inverted timestamps), and clamps out-of-range metadata.
 * The empty-captions check stays in createImport — it must run after the
 * shared-cache lookup so a re-POST of an existing video still hits the cache.
 */
export function validateImportRequest(
  req: ImportRequest,
): { ok: true; value: ValidatedImport } | ValidationError {
  if (!req?.url) return { ok: false, status: 400, error: "url is required" };

  const sourceId = parseYouTubeId(req.url);
  if (!sourceId) return { ok: false, status: 400, error: "invalid YouTube URL" };

  const captions = Array.isArray(req.captions) ? req.captions : [];
  if (captions.length > CAPTIONS_MAX) {
    return { ok: false, status: 400, error: `too many captions (max ${CAPTIONS_MAX})` };
  }

  const rows: NormalizedCaption[] = captions
    .map((c, i) => {
      const start = Math.max(0, intOr(c.startMs, 0));
      const end = Math.max(0, intOr(c.endMs, 0));
      return {
        idx: intOr(c.idx, i),
        // Swap inverted spans rather than persist end < start.
        tStartMs: Math.min(start, end),
        tEndMs: Math.max(start, end),
        textOriginal: String(c.text ?? "").trim().slice(0, TEXT_MAX),
      };
    })
    .filter((r) => r.textOriginal.length > 0);

  const durationS =
    Number.isInteger(req.durationS) &&
    (req.durationS as number) >= 0 &&
    (req.durationS as number) <= DURATION_S_MAX
      ? (req.durationS as number)
      : null;

  return {
    ok: true,
    value: {
      url: `https://www.youtube.com/watch?v=${sourceId}`,
      sourceId,
      title: (req.title?.trim() || sourceId).slice(0, TITLE_MAX),
      channel: req.channel ? req.channel.trim().slice(0, CHANNEL_MAX) || null : null,
      durationS,
      language: req.language || "ja",
      rows,
    },
  };
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
  opts: {
    /** Called only once the import is confirmed NEW (about to run the pipeline). */
    checkRateLimit?: () => Promise<{ ok: boolean; retryAfterSeconds: number }>;
  } = {},
): Promise<ImportResult> {
  const valid = validateImportRequest(req);
  if (!valid.ok) return { status: valid.status, body: { error: valid.error } };
  const { sourceId, title, channel, durationS, language, url, rows } = valid.value;

  // Shared cache (D1/D3): one row per source video, reused across users.
  const cacheHit = (v: { id: string; status: string }): ImportResult => ({
    status: 200,
    body: { videoId: v.id, status: v.status, cached: v.status === "done" },
  });

  const existing = await db.query.videos.findFirst({
    where: (v, { and, eq }) => and(eq(v.source, "youtube"), eq(v.sourceId, sourceId)),
  });
  if (existing) return cacheHit(existing);

  if (rows.length === 0) {
    return {
      status: 422,
      body: { error: "no captions submitted — import from the browser extension" },
    };
  }

  // New import → triggers layer 0 + pre-warm (the system's costliest call). Cache
  // hits above never reach here, so the limit counts only real new imports.
  if (opts.checkRateLimit) {
    const rl = await opts.checkRateLimit();
    if (!rl.ok) {
      return {
        status: 429,
        body: { error: "Too many imports today — try again later.", retryAfterSeconds: rl.retryAfterSeconds },
      };
    }
  }

  // Atomic dedup: two simultaneous POSTs of the same sourceId (e.g. a double
  // click in the extension) race the findFirst above. ON CONFLICT DO NOTHING
  // lets the loser get no row back — re-select and serve the shared cache
  // instead of surfacing the unique-violation as an unhandled 500.
  const [video] = await db
    .insert(videos)
    .values({
      source: "youtube",
      sourceId,
      url,
      title,
      channel,
      durationS,
      language,
      status: "pending",
    })
    .onConflictDoNothing({ target: [videos.source, videos.sourceId] })
    .returning();

  if (!video) {
    const winner = await db.query.videos.findFirst({
      where: (v, { and, eq }) => and(eq(v.source, "youtube"), eq(v.sourceId, sourceId)),
    });
    if (winner) return cacheHit(winner);
    return { status: 500, body: { error: "import registration failed" } };
  }

  await db
    .insert(subtitleLines)
    .values(rows.map((r) => ({ ...r, videoId: video.id })))
    .onConflictDoNothing();

  await queue.add("import", { videoId: video.id });

  return { status: 201, body: { videoId: video.id, status: "pending", lines: rows.length } };
}
