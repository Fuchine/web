import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface SectionHeadingProps {
  children: ReactNode;
  /** Right-aligned affordance, e.g. a "See all" link. */
  action?: ReactNode;
  className?: string;
}

/** Quiet uppercase section label ("CONTINUE WATCHING", "GRAMMAR", …). */
export function SectionHeading({ children, action, className }: SectionHeadingProps) {
  return (
    <div className={cn("mb-[14px] flex items-baseline justify-between", className)}>
      <h2 className="m-0 text-[13px] font-[600] uppercase tracking-[0.04em] text-muted">
        {children}
      </h2>
      {action}
    </div>
  );
}
