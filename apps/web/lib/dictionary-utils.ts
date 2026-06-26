import { sql } from "drizzle-orm";

export const GRAMMAR_POS = [
  "aux",
  "aux-adj",
  "aux-v",
  "conj",
  "cop",
  "prt",
  "pref",
  "suf",
  "ctr",
] as const;

export function firstGloss(defs: { glosses: string[] }[]): string {
  return defs[0]?.glosses?.join("; ") ?? "";
}

export function computeMastery(stats: { reviewsOk: number | null; reviewsTotal: number | null } | null): number[] {
  if (!stats || !stats.reviewsTotal || stats.reviewsTotal === 0) return [0, 0, 0, 0];
  const pct = stats.reviewsOk! / stats.reviewsTotal;
  const level = pct >= 0.7 ? 3 : pct >= 0.3 ? 2 : 1;
  return [level, level, level, level];
}

export function computeStatus(m: number[]): "known" | "learning" | "new" {
  const sum = m[0] + m[1] + m[2] + m[3];
  if (sum >= 10) return "known";
  if (sum >= 1) return "learning";
  return "new";
}

export function grammarPosCondition(posColumn: any) {
  return sql`string_to_array(${posColumn}, ',') && ARRAY[${sql.join(
    GRAMMAR_POS.map((p) => sql`${p}`),
    sql`, `,
  )}]::text[]`;
}
