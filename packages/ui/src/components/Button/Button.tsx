import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "ghost" | "quiet";
export type ButtonSize = "md" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. primary = indigo surface, ghost = outlined, quiet = bare. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width. */
  fullWidth?: boolean;
  /** Show a spinner and disable interaction. */
  loading?: boolean;
  /** Leading icon (≈17px svg). Replaced by the spinner while loading. */
  icon?: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-[9px] font-[550] whitespace-nowrap " +
  "rounded border border-transparent cursor-pointer select-none " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease)] " +
  "active:translate-y-[0.5px] disabled:cursor-default disabled:opacity-[0.55] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring " +
  "[&_svg]:w-[17px] [&_svg]:h-[17px] [&_svg]:flex-none";

const sizeCx: Record<ButtonSize, string> = {
  md: "h-[46px] px-5 text-[14.5px]",
  sm: "h-9 px-3.5 text-[13px]",
};

const variantCx: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press",
  ghost: "bg-surface text-fg border-border-strong hover:border-faint",
  quiet: "bg-transparent text-muted hover:bg-bg-2 hover:text-fg",
};

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The Fuchine button. Recreated from the Claude Design handoff: 46px tall,
 * weight 550, 11px radius, indigo 藍 surface, with a calm press nudge.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", fullWidth, loading, icon, disabled, children, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, sizeCx[size], variantCx[variant], fullWidth && "w-full", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});
