import { type InputHTMLAttributes, type ReactNode, forwardRef } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Mark the field invalid (red border, aria-invalid). */
  invalid?: boolean;
  /** A ≈19px icon shown inside the field on the left. */
  leadingIcon?: ReactNode;
}

const inputCx =
  "w-full h-[46px] px-[14px] text-[14.5px] text-fg bg-field rounded border border-border-strong " +
  "outline-none transition-[border-color,box-shadow] duration-200 ease-[var(--ease)] " +
  "placeholder:text-faint hover:border-faint " +
  "focus:border-accent focus:shadow-[0_0_0_3.5px_var(--accent-ring)] " +
  "disabled:opacity-60 disabled:cursor-default";

/** Bare text control — the field's input. Use TextField for label + error. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, leadingIcon, className, ...rest },
  ref,
) {
  const control = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        inputCx,
        invalid && "border-error focus:border-error focus:shadow-none",
        leadingIcon ? "pl-[46px]" : null,
        className,
      )}
      {...rest}
    />
  );

  if (!leadingIcon) return control;
  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-[15px] h-[19px] w-[19px] text-faint [&_svg]:h-full [&_svg]:w-full">
        {leadingIcon}
      </span>
      {control}
    </div>
  );
});
