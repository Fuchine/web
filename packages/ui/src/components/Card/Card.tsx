import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Hover lift + shadow + pointer, for clickable cards. */
  interactive?: boolean;
  /** Faint warm panel instead of the white surface. */
  muted?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const padCx = { none: "", sm: "p-3", md: "p-5", lg: "p-7" };

/** A calm surface container — the base for panels, rows, and tiles. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive, muted, padding = "md", className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-border",
        muted ? "bg-bg-2" : "bg-surface",
        padCx[padding],
        interactive &&
          "cursor-pointer transition-[box-shadow,transform] duration-200 ease-[var(--ease)] hover:-translate-y-[2px] hover:shadow-[var(--shadow)]",
        className,
      )}
      {...rest}
    />
  );
});
