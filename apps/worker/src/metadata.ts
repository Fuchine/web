// Metadata freshness (T3.10). Video metadata (title, channel, duration) is
// captured by the browser extension from the user's own YouTube session —
// never from the YouTube Data API, whose terms forbid keeping API data longer
// than 30 days without refreshing it. We adopt the same 30-day horizon as
// hygiene: `videos.fetched_at` records the last capture (a re-import through
// the extension refreshes it), and `refresh:metadata` lists what is older for
// re-capture, or — with --expire — clears the YouTube-owned display fields
// that study does not need (channel, duration). The server never calls
// YouTube. Policy: ARQUITETURA.md §5 / ARCHITECTURE.md (metadata freshness).

import { and, asc, lt, sql } from "drizzle-orm";
import { type Database, videos } from "@fuchine/db";

export const METADATA_MAX_AGE_DAYS = 30;

export function staleCutoff(now: Date, days: number = METADATA_MAX_AGE_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export type StaleVideo = { id: string; sourceId: string; title: string; channel: string | null; fetchedAt: Date; ageDays: number };

export async function listStaleVideos(db: Database, opts: { now?: Date; days?: number; limit?: number } = {}): Promise<StaleVideo[]> {
  const now = opts.now ?? new Date();
  const rows = await db
    .select({ id: videos.id, sourceId: videos.sourceId, title: videos.title, channel: videos.channel, fetchedAt: videos.fetchedAt })
    .from(videos)
    .where(lt(videos.fetchedAt, staleCutoff(now, opts.days)))
    .orderBy(asc(videos.fetchedAt))
    .limit(opts.limit ?? 10_000);
  return rows.map((r) => ({ ...r, ageDays: Math.floor((now.getTime() - r.fetchedAt.getTime()) / 86_400_000) }));
}

/**
 * Expire stale metadata: null `channel` and `duration_s` on videos older than
 * the horizon that still carry them. Title, captions and all study data stay
 * (the title identifies the user's material; captions are the user's own
 * capture). The next re-capture restores the fields. Returns rows touched.
 */
export async function expireStaleMetadata(db: Database, opts: { now?: Date; days?: number } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const res = await db
    .update(videos)
    .set({ channel: null, durationS: null })
    .where(and(
      lt(videos.fetchedAt, staleCutoff(now, opts.days)),
      sql`(${videos.channel} is not null or ${videos.durationS} is not null)`,
    ))
    .returning({ id: videos.id });
  return res.length;
}
