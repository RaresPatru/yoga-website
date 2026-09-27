"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Shown beside the box, and part of what can be pressed. Without it, pass `aria-label`. */
  label?: ReactNode;
  /** A standing explanation under the label, read with the box by a screen reader. */
  hint?: ReactNode;
  /** "Some of these", for a box that selects a whole list. */
  indeterminate?: boolean;
}

/**
 * A checkbox in the site's colours, the same in every browser.
 *
 * The native input is still the control: `appearance: none` removes the
 * browser's drawing and the box is styled on the input itself, so the
 * keyboard, the form, the screen reader and a tap on the label all work as
 * they would on a plain checkbox. The tick is drawn over it. `accent-color`
 * would be less code, but Safari only follows it from 26.2, and the booking
 * form is read mostly in iPhone browsers.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, indeterminate = false, className, id, ...props },
  ref
) {
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current!);
  // `indeterminate` exists only as a DOM property, not as an attribute.
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;

  const box = (
    <span className={cn("relative inline-flex h-5 w-5 shrink-0", label ? "mt-0.5" : className)}>
      <input
        ref={inner}
        id={inputId}
        type="checkbox"
        aria-describedby={hintId}
        className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-sage-deep/50 bg-white transition-colors checked:border-rose-deep checked:bg-rose-deep indeterminate:border-rose-deep indeterminate:bg-rose-deep disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <Check
        className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 text-white opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0"
        strokeWidth={3}
        aria-hidden="true"
      />
      <Minus
        className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 text-white opacity-0 peer-indeterminate:opacity-100"
        strokeWidth={3}
        aria-hidden="true"
      />
    </span>
  );

  if (!label) return box;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-charcoal">
        {box}
        <span className="min-w-0">{label}</span>
      </label>
      {hint && (
        <p id={hintId} className="mt-1 pl-8 text-xs leading-relaxed text-charcoal-light">
          {hint}
        </p>
      )}
    </div>
  );
});
