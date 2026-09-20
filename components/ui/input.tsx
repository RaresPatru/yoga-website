"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /**
   * A standing explanation of what the field means — not a complaint about what
   * was typed in it, which is `error`.
   *
   * Separate from `error` because they are read at different moments and by
   * different people: a hint is there before anyone types, an error only after.
   * Both end up in `aria-describedby` so a screen reader gets them with the
   * field rather than as loose text somewhere near it.
   */
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;
    // Both, in reading order, and `undefined` rather than an empty string when
    // there is neither — React drops the attribute entirely for `undefined`,
    // while `aria-describedby=""` points at nothing and some screen readers
    // announce the field as described by a missing element.
    const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-charcoal-light">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal",
            "placeholder:text-charcoal-light/50 backdrop-blur-sm",
            // `transition-colors`, not `transition-all`. Colour is the only
            // thing here that changes, and `all` also animates layout
            // properties — including, since Tailwind v4, `outline-color`, which
            // made the focus indicator fade in rather than appear.
            "transition-colors duration-200",
            // Focus is handled globally — see the rule in globals.css. `error`
            // still sets the resting border; `aria-invalid` above is what tells
            // that rule to draw the focus outline in the error colour too.
            error && "border-error",
            className
          )}
          {...props}
        />
        {hint && (
          <p id={hintId} className="text-sm text-charcoal-light">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
