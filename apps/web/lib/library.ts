// Shared mapping from a listVideos row to the client LibraryVideo shape, so the
// server page and the paginated GET /api/videos route agree on exactly one
// mapping (level derivation, field selection). Comprehension is computed per
// page and passed in.

import type { LibraryVideo } from "@/app/library-view";
import type { Coverage } from "./known-words";

export const LEVEL: Record<string, number> = { beginner: 1, intermediate: 3, advanced: 5 };

/** The subset of a listVideos row that LibraryVideo needs (extra fields ok). */
export type LibraryListRow = {
  id: string;
  title: string;
  channel: string | null;
  source: string;
  sourceId: string;
  durationS: number | null;
  status: LibraryVideo["status"];
  statusReason: string | null;
  levelEstimate: string | null;
  embeddable: boolean | null;
  category: string | null;
};

/** `coverage`: the page's token-weighted coverage (T3.9), null = no number. */
export function toLibraryVideo(v: LibraryListRow, coverage: Coverage | null): LibraryVideo {
  return {
    id: v.id,
    title: v.title,
    channel: v.channel,
    source: v.source,
    sourceId: v.sourceId,
    durationS: v.durationS,
    status: v.status,
    statusReason: v.statusReason,
    level: v.levelEstimate ? (LEVEL[v.levelEstimate] ?? null) : null,
    comprehension: coverage?.headline ?? null,
    coverageBand: coverage ? { low: coverage.low, high: coverage.high, unique: coverage.unique } : null,
    embeddable: v.embeddable,
    category: v.category,
  };
}
