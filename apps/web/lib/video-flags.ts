// Per-user video flags (backlog: library-video-actions). Save for later / hide /
// not interested on shared-cache videos. Auth-agnostic and testable.

import { and, eq } from "drizzle-orm";
import { type Database, userVideoFlags } from "@fuchine/db";

export type VideoFlag = "saved" | "hidden" | "not_interested";
export const VIDEO_FLAGS: VideoFlag[] = ["saved", "hidden", "not_interested"];

/** Set a flag (idempotent). */
export async function setVideoFlag(
  db: Database,
  userId: string,
  videoId: string,
  flag: VideoFlag,
): Promise<void> {
  await db
    .insert(userVideoFlags)
    .values({ userId, videoId, flag })
    .onConflictDoNothing();
}

/** Clear a flag (no-op if absent). */
export async function clearVideoFlag(
  db: Database,
  userId: string,
  videoId: string,
  flag: VideoFlag,
): Promise<void> {
  await db
    .delete(userVideoFlags)
    .where(
      and(
        eq(userVideoFlags.userId, userId),
        eq(userVideoFlags.videoId, videoId),
        eq(userVideoFlags.flag, flag),
      ),
    );
}

export type VideoFlagSets = { saved: string[]; hidden: string[] };

/**
 * The user's flags for hydrating the library: saved ids, and the ids to hide
 * (hidden ∪ not_interested — both remove the card from the grid).
 */
export async function getVideoFlags(db: Database, userId: string): Promise<VideoFlagSets> {
  const rows = await db
    .select({ videoId: userVideoFlags.videoId, flag: userVideoFlags.flag })
    .from(userVideoFlags)
    .where(eq(userVideoFlags.userId, userId));
  const saved: string[] = [];
  const hidden: string[] = [];
  for (const r of rows) {
    if (r.flag === "saved") saved.push(r.videoId);
    else hidden.push(r.videoId); // hidden or not_interested
  }
  return { saved, hidden };
}
