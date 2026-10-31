import type { DictDefinition } from "@fuchine/db/types";
import { cn } from "../../lib/cn";
import { DictDefinitionView } from "../StructuredContent/StructuredContent";

/**
 * Imported (Yomitan) dictionaries under the JMdict entry (T3.4), in the
 * user's order. Shapes match GET /api/dictionary?id= (`dictionaries`,
 * `frequencies`); see apps/web/lib/dictionaries.ts.
 */
export type DictSectionInfo = {
  dictionaryId: string;
  title: string;
  /** Definitions in the word's own language (e.g. 国語辞典). */
  monolingual: boolean;
  entries: { expression: string; reading: string; definitions: DictDefinition[]; tags: string[] }[];
};

export type DictFrequencyInfo = {
  dictionaryId: string;
  title: string;
  /** Lower = more frequent, whatever the list's own mode. */
  rank: number;
  /** The list's own label for the value ("1234㋕"), when it has one. */
  display: string | null;
};

export function DictSections({ sections, className }: { sections: readonly DictSectionInfo[] | null | undefined; className?: string }) {
  const list = (sections ?? []).filter((s) => s.entries.length > 0);
  if (list.length === 0) return null;
  return (
    <div className={cn("dict-sections", className)} data-testid="dict-sections">
      {list.map((s) => (
        <section key={s.dictionaryId} className="dict-section" aria-label={s.title}>
          <header className="dict-section-head">
            <span className="dict-section-title">{s.title}</span>
            {s.monolingual && <span className="dict-section-badge" title="Definitions in Japanese">Monolingual</span>}
          </header>
          {s.entries.map((e, i) => (
            <div key={i} className="dict-section-entry">
              {s.entries.length > 1 && (
                <div className="dict-section-headword jp">
                  {e.expression}
                  {e.reading !== e.expression && <span className="r">【{e.reading}】</span>}
                </div>
              )}
              {e.tags.length > 0 && (
                <div className="dp-def-tags">
                  {e.tags.map((t) => <span key={t} className="dp-def-tag">{t}</span>)}
                </div>
              )}
              {e.definitions.map((d, j) => (
                <DictDefinitionView key={j} def={d} className="dict-section-def jp" />
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function DictFrequencyChips({ frequencies, className }: { frequencies: readonly DictFrequencyInfo[] | null | undefined; className?: string }) {
  if (!frequencies?.length) return null;
  return (
    <span className={cn("dict-freqs", className)} data-testid="dict-frequencies">
      {frequencies.map((f) => (
        <span key={f.dictionaryId} className="dict-freq" title={`${f.title}: rank ${f.rank} (lower = more frequent)`}>
          <span className="k">{f.title}</span>
          <span className="v">{f.display ?? f.rank}</span>
        </span>
      ))}
    </span>
  );
}
