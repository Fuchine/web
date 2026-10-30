import { PITCH_CATEGORY_LABEL, pitchPattern, type PitchPattern } from "@fuchine/core";
import { cn } from "../../lib/cn";

/** Pitch data as the dictionary API returns it (one item per source). */
export type PitchInfo = { reading: string; positions: number[]; source: string };

// Inline so side-specific colors never fight Tailwind's utility ordering.
const LINE = "var(--link)";

const SOURCE_LABEL: Record<string, string> = { kanjium: "Kanjium" };

export function pitchSourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

/**
 * One reading drawn with its pitch: an overline over the high morae and a
 * downward tick where the pitch drops. A trailing dashed stub stands for a
 * following particle — overlined only for heiban (the particle stays high).
 */
export function PitchPatternMarks({ pattern, className }: { pattern: PitchPattern; className?: string }) {
  const label = PITCH_CATEGORY_LABEL[pattern.category];
  return (
    <span
      className={cn("jp inline-flex items-end leading-none", className)}
      role="img"
      aria-label={`${label.en} (${label.ja}), downstep ${pattern.downstep}`}
      data-category={pattern.category}
    >
      {pattern.morae.map((m, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="inline-block px-[1px] pt-[3px] border-solid border-t-[1.5px] border-r-[1.5px] border-b-0 border-l-0"
          style={{
            borderTopColor: pattern.high[i] ? LINE : "transparent",
            borderRightColor: pattern.dropAfter === i ? LINE : "transparent",
          }}
        >
          {m}
        </span>
      ))}
      <span
        aria-hidden="true"
        className="inline-block w-[0.55em] self-stretch border-dashed border-t-[1.5px] border-x-0 border-b-0"
        style={{ borderTopColor: pattern.particleHigh ? LINE : "transparent" }}
      />
    </span>
  );
}

export type PitchAccentProps = {
  pitch: readonly PitchInfo[] | null | undefined;
  /** Text size of the reading marks. */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Every accent of a word with its category (平板/頭高/中高/尾高) and the source
 * credited underneath ("Pitch: Kanjium"). Renders nothing without data or when
 * no position fits the reading.
 */
export function PitchAccent({ pitch, size = "sm", className }: PitchAccentProps) {
  const groups = (pitch ?? [])
    .map((p) => ({
      source: p.source,
      patterns: p.positions
        .map((n) => pitchPattern(p.reading, n))
        .filter((x): x is PitchPattern => x !== null),
    }))
    .filter((g) => g.patterns.length > 0);
  if (groups.length === 0) return null;

  const sources = [...new Set(groups.map((g) => pitchSourceLabel(g.source)))].join(", ");
  return (
    <div className={cn("flex flex-col gap-[5px]", className)} data-testid="pitch-accent">
      {groups.flatMap((g) =>
        g.patterns.map((p) => {
          const label = PITCH_CATEGORY_LABEL[p.category];
          return (
            <div key={`${g.source}-${p.downstep}`} className="flex items-center gap-[9px] flex-wrap">
              <PitchPatternMarks
                pattern={p}
                className={cn("text-fg", size === "md" ? "text-[17px]" : "text-[14px]")}
              />
              <span className="text-[11.5px] text-muted">
                {label.en} <span className="jp">{label.ja}</span>
                <span className="text-faint tabular-nums"> [{p.downstep}]</span>
              </span>
            </div>
          );
        }),
      )}
      <span className="text-[10.5px] text-faint tracking-[0.02em]">Pitch: {sources}</span>
    </div>
  );
}
