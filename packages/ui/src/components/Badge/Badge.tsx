import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export type BadgeVariant = "neutral" | "indigo" | "ok" | "warning" | "error";

export interface BadgeProps {
  variant?: BadgeVariant;
  /** Show a leading status dot (used for phrase/video status pills). */
  dot?: boolean;
  /** Fully rounded pill (status) vs a small tag (POS / JLPT). */
  pill?: boolean;
  className?: string;
  children: ReactNode;
}

const variantCx: Record<BadgeVariant, string> = {
  neutral: "text-muted bg-bg-2",
  indigo: "text-link bg-accent-soft-2",
  ok: "text-ok bg-ok-soft",
  warning: "text-[oklch(0.50_0.10_70)] bg-[oklch(0.62_0.10_70/0.13)]",
  error: "text-error bg-[oklch(0.55_0.135_27/0.12)]",
};

const dotCx: Record<BadgeVariant, string> = {
  neutral: "bg-faint",
  indigo: "bg-link",
  ok: "bg-ok",
  warning: "bg-[oklch(0.62_0.10_70)]",
  error: "bg-error",
};

/**
 * Small status/category label. Tag form (POS like "Noun", JLPT like "N4") or
 * pill form with a dot (New / Learning / Due / Known).
 */
export function Badge({ variant = "neutral", dot, pill, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[6px] text-[11.5px] font-[600] tracking-[0.01em] whitespace-nowrap",
        pill ? "rounded-full px-[11px] py-[5px]" : "rounded-md px-[8px] py-[3px]",
        variantCx[variant],
        className,
      )}
    >
      {dot && <i className={cn("h-[7px] w-[7px] rounded-full", dotCx[variant])} />}
      {children}
    </span>
  );
}
