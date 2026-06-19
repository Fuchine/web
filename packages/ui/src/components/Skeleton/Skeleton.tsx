import { cn } from "../../lib/cn";

export interface SkeletonProps {
  /** Defaults to a 1:1 aspect-ratio rounded square */
  ratio?: "none" | "video" | "circle";
  animation?: "pulse" | "none";
  className?: string;
}

const ratioCx = {
  none: "",
  video: "aspect-video",
  circle: "aspect-square rounded-full",
};

export function Skeleton({ ratio = "none", animation = "pulse", className }: SkeletonProps) {
  return (
    <span
      className={cn(
        "block bg-bg-2",
        animation === "pulse" && "animate-pulse",
        ratioCx[ratio],
        className,
      )}
      aria-hidden="true"
    />
  );
}
