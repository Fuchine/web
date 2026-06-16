import { type ReactNode, forwardRef, useId } from "react";
import { cn } from "../../lib/cn";
import { Input, type InputProps } from "./Input";

export interface TextFieldProps extends InputProps {
  label?: ReactNode;
  /** Error message (also sets the field invalid). */
  error?: string;
  /** Calm helper text shown when there's no error. */
  helper?: string;
  /** Right-aligned affordance next to the label, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode;
  containerClassName?: string;
}

/** Label + input + error/helper, with the label wired to the control. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, helper, labelAction, id, invalid, containerClassName, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errId = `${inputId}-err`;

  return (
    <div className={cn("mb-[18px]", containerClassName)}>
      {(label || labelAction) && (
        <div className="flex items-baseline justify-between">
          {label && (
            <label
              htmlFor={inputId}
              className="mb-[7px] block text-[12.5px] font-medium tracking-[0.005em] text-muted"
            >
              {label}
            </label>
          )}
          {labelAction}
        </div>
      )}
      <Input
        ref={ref}
        id={inputId}
        invalid={invalid || !!error}
        aria-describedby={error ? errId : undefined}
        {...rest}
      />
      {error ? (
        <p id={errId} className="mt-[7px] text-[12.5px] text-error">{error}</p>
      ) : helper ? (
        <p className="mt-[7px] text-[12.5px] text-faint">{helper}</p>
      ) : null}
    </div>
  );
});
