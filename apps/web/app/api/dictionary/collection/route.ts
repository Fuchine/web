import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { savedWords, wordEntries, userWordStats } from "@fuchine/db";
import { freqTier } from "@/lib/dictionary";

export type CollectionItem = {
  id: string;
  w: string;
  r: string | null;
  pos: string | null;
  def: string;
  status: "known" | "learning" | "new";
  freq: number;
  m: number[];
};

function computeMastery(reviewsOk: number | null, reviewsTotal: number | null): number[] {
  if (!reviewsTotal || reviewsTotal === 0) return [0, 0, 0, 0];
  const pct = reviewsOk! / reviewsTotal;
  const level = pct >= 0.7 ? 3 : pct >= 0.3 ? 2 : 1;
  return [level, level, level, level];
}

function computeStatus(m: number[]): "known" | "learning" | "new" {
  const sum = m[0] + m[1] + m[2] + m[3];
  if (sum >= 10) return "known";
  if (sum >= 1) return "learning";
  return "new";
}

function firstGloss(defs: { glosses: string[] }[]): string {
  return defs[0]?.glosses?.join("; ") ?? "";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: wordEntries.id,
      lemma: wordEntries.lemma,
      reading: wordEntries.reading,
      pos: wordEntries.pos,
      definitions: wordEntries.definitions,
      frequencyRank: wordEntries.frequencyRank,
      reviewsOk: userWordStats.reviewsOk,
      reviewsTotal: userWordStats.reviewsTotal,
    })
    .from(savedWords)
    .innerJoin(wordEntries, eq(savedWords.wordEntryId, wordEntries.id))
    .leftJoin(
      userWordStats,
      and(
        eq(userWordStats.userId, savedWords.userId),
        eq(userWordStats.wordEntryId, savedWords.wordEntryId),
      ),
    )
    .where(eq(savedWords.userId, session.user.id))
    .orderBy(wordEntries.lemma);

  const items: CollectionItem[] = rows.map((r) => {
    const m = computeMastery(r.reviewsOk, r.reviewsTotal);
    return {
      id: r.id,
      w: r.lemma,
      r: r.reading,
      pos: r.pos,
      def: firstGloss(r.definitions as { glosses: string[] }[]),
      status: computeStatus(m),
      freq: freqTier(r.frequencyRank),
      m,
    };
  });

  return NextResponse.json({ items });
}
