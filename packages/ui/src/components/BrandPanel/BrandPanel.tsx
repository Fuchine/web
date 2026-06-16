import { cn } from "../../lib/cn";

export interface BrandPanelProps {
  kanji?: string;
  reading?: string;
  gloss?: string;
  phrase?: string;
  /** Quiet subtitle "nod" at the bottom; pass null to hide. */
  caption?: { jp: string; gloss: string } | null;
  className?: string;
}

/** The deep-indigo 藍 brand field — the one place expressive JP type leads. */
export function BrandPanel({
  kanji = "淵",
  reading = "ふち ・ fuchi",
  gloss = "THE DEPTHS",
  phrase = "言葉の淵に、静かに沈んでいく",
  caption = { jp: "今、言葉の中へ", gloss: "INTO THE LANGUAGE" },
  className,
}: BrandPanelProps) {
  return (
    <div className={cn("relative flex flex-col items-center justify-center overflow-hidden bg-indigo text-[var(--on-indigo)]", className)}>
      {/* vertical + vignette gradients */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(180deg, var(--indigo-2) 0%, var(--indigo) 46%, var(--indigo-deep) 100%)" }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 38%, transparent 50%, rgba(0,0,0,0.28) 100%)" }}
      />

      <div className="relative z-[1] flex flex-col items-center px-10 text-center">
        <div
          className="font-['Noto_Serif_JP',serif] font-normal leading-[0.92] tracking-[0.02em] text-[var(--on-indigo)] [text-shadow:0_2px_40px_rgba(0,0,0,0.25)]"
          style={{ fontSize: "clamp(140px, 20vw, 268px)", marginBottom: 14 }}
        >
          {kanji}
        </div>
        <div className="mb-[6px] font-['Noto_Sans_JP',sans-serif] text-[16px] tracking-[0.34em] text-[var(--on-indigo-dim)]">
          {reading}
        </div>
        <div className="text-[13px] font-[450] tracking-[0.16em] text-[var(--on-indigo-faint)]">{gloss}</div>
        <div className="my-[30px] h-px w-16 bg-[var(--on-indigo-faint)] opacity-50" />
        <div className="font-['Noto_Serif_JP',serif] text-[19px] font-light tracking-[0.14em] text-[var(--on-indigo-dim)]">
          {phrase}
        </div>
      </div>

      {caption && (
        <div className="absolute inset-x-0 bottom-10 z-[1] flex flex-col items-center gap-[10px] opacity-90">
          <div className="inline-flex items-center gap-3 rounded-[9px] bg-black/20 px-4 py-[9px]">
            <span className="font-['Noto_Sans_JP',sans-serif] text-[14px] tracking-[0.08em] text-[var(--on-indigo)]">
              {caption.jp}
            </span>
            <span className="text-[11.5px] tracking-[0.04em] text-[var(--on-indigo-faint)]">{caption.gloss}</span>
          </div>
          <div className="flex gap-[5px]">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className="h-[2.5px] w-[18px] rounded-sm bg-[var(--on-indigo-faint)]" style={{ opacity: i === 1 ? 0.9 : 0.4 }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
