// Explore's per-user candidate pre-filter (T3.10): materialize, for one user,
// the coverage tier sums of every catalog video into user_video_coverage with
// ONE INSERT … SELECT over video_word_counts (the same aggregate as the
// library's per-page coverage, but over the whole catalog, run in the
// background — never per Explore request). Called by the worker's
// `refresh-coverage` job (stale-while-revalidate, enqueued by /explore) and,
// once, synchronously on a user's first Explore visit.
// Spec + measured costs: docs/plans/2026-10-30-explore-spec.md.

import { sql } from "drizzle-orm";
import type { DbOrTx } from "./client";
import { userVideoCoverage, videoWordCounts, videos, wordEntries } from "./schema";
import { wordTierSqlFor, LIKELY_MIN_VIEWS } from "./known-words";

/**
 * "Common" for Explore's novelty signal: a word inside the top ~5000 of the
 * frequency list (frequency_rank comes in bands of 500 from JMdict's nfXX
 * tags; nf01–nf10). Unknown common words are the ones worth meeting next.
 */
export const NOVELTY_MAX_RANK = 5000;

export type CoverageRefresh = { videos: number; ms: number };

/**
 * (Re)compute this user's row for every done video (or only `videoIds`).
 * Idempotent upsert; rows of deleted videos go with the FK cascade.
 * `minViews` = the calibrated likely threshold in force for the user.
 */
export async function refreshUserVideoCoverage(
  db: DbOrTx,
  userId: string,
  opts: { minViews?: number; videoIds?: readonly string[]; now?: Date } = {},
): Promise<CoverageRefresh> {
  const started = Date.now();
  if (opts.videoIds && opts.videoIds.length === 0) return { videos: 0, ms: 0 };
  const tier = wordTierSqlFor(opts.minViews ?? LIKELY_MIN_VIEWS);
  const now = opts.now ?? new Date();
  const only = opts.videoIds
    ? sql`and ${videoWordCounts.videoId} in (${sql.join(opts.videoIds.map((id) => sql`${id}::uuid`), sql`, `)})`
    : sql``;
  const res = await db.execute(sql`
    insert into ${userVideoCoverage} (
      "user_id", "video_id", "tokens", "words", "confirmed_tokens", "likely_tokens",
      "confirmed_words", "likely_words", "new_common_words", "computed_at"
    )
    select ${userId}::uuid, x.video_id,
      sum(x.occ)::int,
      count(*)::int,
      coalesce(sum(x.occ) filter (where x.tier = 'confirmed'), 0)::int,
      coalesce(sum(x.occ) filter (where x.tier = 'likely'), 0)::int,
      count(*) filter (where x.tier = 'confirmed')::int,
      count(*) filter (where x.tier = 'likely')::int,
      count(*) filter (where x.tier = 'unknown' and x.freq <= ${sql.raw(String(NOVELTY_MAX_RANK))})::int,
      ${now.toISOString()}::timestamptz
    from (
      select ${videoWordCounts}."video_id" as video_id,
        ${videoWordCounts}."occurrences" as occ,
        ${tier} as tier,
        ${wordEntries}."frequency_rank" as freq
      from ${videoWordCounts}
      join ${videos} on ${videos}."id" = ${videoWordCounts}."video_id" and ${videos}."status" = 'done'
      join ${wordEntries} on ${wordEntries}."id" = ${videoWordCounts}."word_entry_id"
      left join "user_word_stats" on "user_word_stats"."user_id" = ${userId}::uuid
        and "user_word_stats"."word_entry_id" = ${videoWordCounts}."word_entry_id"
      left join "saved_words" on "saved_words"."user_id" = ${userId}::uuid
        and "saved_words"."word_entry_id" = ${videoWordCounts}."word_entry_id"
      where ${videoWordCounts}."occurrences" > 0 ${only}
    ) x
    group by x.video_id
    on conflict ("user_id", "video_id") do update set
      "tokens" = excluded."tokens",
      "words" = excluded."words",
      "confirmed_tokens" = excluded."confirmed_tokens",
      "likely_tokens" = excluded."likely_tokens",
      "confirmed_words" = excluded."confirmed_words",
      "likely_words" = excluded."likely_words",
      "new_common_words" = excluded."new_common_words",
      "computed_at" = excluded."computed_at"
  `);
  const count = (res as unknown as { count?: number }).count ?? 0;
  return { videos: Number(count), ms: Date.now() - started };
}
