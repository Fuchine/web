import { cn } from "../../lib/cn";
import { Skeleton } from "../Skeleton/Skeleton";

export interface VideoCardProps {
  title: string;
  channel: string;
  /** e.g. "12:34" */
  durationLabel?: string;
  /** estimated level, shown as "LVL n" */
  level?: number;
  /** 0–100 comprehension estimate */
  comprehension?: number;
  /** 0–100 watch progress; shows a bar on the thumbnail */
  progress?: number;
  thumbnailUrl?: string;
  /** Show skeleton placeholder while thumbnail is loading */
  thumbnailLoading?: boolean;
  /** 1–6 calm tonal placeholder when there's no thumbnail */
  tone?: 1 | 2 | 3 | 4 | 5 | 6;
  comprehensionStyle?: "ring" | "text";
  onPlay?: () => void;
  onOverflow?: () => void;
  className?: string;
}

const TONES: Record<number, string> = {
  1: "linear-gradient(155deg, var(--indigo-2), var(--indigo-deep))",
  2: "linear-gradient(155deg, #2A3A4D, #141F2C)",
  3: "linear-gradient(155deg, #3A352C, #201B14)",
  4: "linear-gradient(152deg, #2A403C, #14201E)",
  5: "linear-gradient(150deg, #393040, #201A26)",
  6: "linear-gradient(155deg, #343A2C, #1B2014)",
};

function Ring({ pct }: { pct: number }) {
  const r = 8.7;
  const circ = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 22 22" className="h-[22px] w-[22px] flex-none -rotate-90" aria-hidden="true">
      <circle cx="11" cy="11" r={r} fill="none" strokeWidth="2.6" className="stroke-[var(--accent-line)]" />
      <circle
        cx="11" cy="11" r={r} fill="none" strokeWidth="2.6" strokeLinecap="round"
        className="stroke-accent"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - Math.max(0, Math.min(100, pct)) / 100)}
      />
    </svg>
  );
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="ml-[2px] h-[15px] w-[15px]">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const DotsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[18px] w-[18px]">
    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
  </svg>
);

/** A calm video tile: thumbnail, level, title, channel, comprehension. */
export function VideoCard({
  title, channel, durationLabel, level, comprehension, progress,
  thumbnailUrl, thumbnailLoading, tone = 1, comprehensionStyle = "ring", onPlay, onOverflow, className,
}: VideoCardProps) {
  return (
    <div className={cn("group relative flex w-full flex-col text-left", className)}>
      <button
        type="button"
        onClick={onPlay}
        className="block w-full cursor-pointer rounded border-0 bg-transparent p-0"
      >
        <div
          className="relative aspect-video w-full overflow-hidden rounded border border-border transition-[transform,box-shadow] duration-200 ease-[var(--ease)] group-hover:-translate-y-[2px] group-hover:shadow-[var(--shadow)]"
          style={thumbnailUrl || thumbnailLoading ? undefined : { background: TONES[tone] }}
        >
          {thumbnailLoading ? (
            <Skeleton className="h-full w-full" />
          ) : thumbnailUrl ? (
            <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
          {level != null && (
            <span className="absolute left-[7px] top-[7px] z-[1] rounded-md border border-white/15 bg-[rgba(12,20,38,0.55)] px-[7px] py-[2px] text-[10.5px] font-[600] tracking-[0.03em] text-[#EAF0FA] backdrop-blur-[2px]">
              LVL {level}
            </span>
          )}
          {durationLabel && (
            <span className="absolute bottom-[7px] right-[7px] z-[1] rounded-[5px] bg-[rgba(8,12,22,0.62)] px-[6px] py-[1.5px] text-[11px] font-medium tabular-nums text-white">
              {durationLabel}
            </span>
          )}
          <span className="absolute left-1/2 top-1/2 z-[1] grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 scale-90 place-items-center rounded-full bg-white/[0.16] text-white opacity-0 backdrop-blur-[2px] transition-[opacity,transform] duration-200 ease-[var(--ease)] group-hover:scale-100 group-hover:opacity-100">
            <PlayIcon />
          </span>
          {progress != null && progress > 0 && (
            <span className="absolute inset-x-0 bottom-0 z-[1] block h-1 bg-black/30">
              <span className="block h-full bg-accent" style={{ width: `${Math.min(100, progress)}%` }} />
            </span>
          )}
        </div>
      </button>

      <div className="px-[1px] pt-[11px]">
        <p className="m-0 mb-[5px] line-clamp-2 text-[13.5px] font-[550] leading-[1.5] text-fg jp">{title}</p>
        <p className="m-0 truncate text-[12.5px] text-faint">{channel}</p>
      </div>

      {comprehension != null && (
        <div className="mt-[11px] flex items-center gap-[10px]">
          <span className="inline-flex items-center gap-2">
            {comprehensionStyle === "ring" && <Ring pct={comprehension} />}
            <span className="text-[12px] tabular-nums text-muted">
              {comprehensionStyle === "text" ? "Comprehension " : ""}
              <b className="font-[600] text-fg">{comprehension}%</b>
            </span>
          </span>
          <span className="flex-1" />
          {onOverflow && (
            <button
              type="button"
              onClick={onOverflow}
              aria-label="More"
              className="grid h-7 w-7 flex-none place-items-center rounded-[7px] text-faint opacity-0 transition-[background-color,color,opacity] duration-150 hover:bg-bg-2 hover:text-muted group-hover:opacity-100"
            >
              <DotsIcon />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
