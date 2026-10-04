"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A row of mutually exclusive options that look like one pill-shaped control:
 * RO | EN, or Name | Logo | Both.
 *
 * Underneath it is a radio group in a <fieldset>, so a screen reader hears
 * "RO, radio button, 1 of 2, selected" and the arrow keys move between the
 * options without any code here. The radios themselves are visually hidden;
 * each label is the visible segment, and it takes the focus ring when its
 * radio has keyboard focus.
 */
export function Segmented<T extends string>({
  legend,
  hideLegend = false,
  value,
  options,
  onChange,
  className,
}: {
  legend: string;
  /** For a control whose purpose is obvious from where it sits. */
  hideLegend?: boolean;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className={hideLegend ? "sr-only" : "mb-1.5 text-sm font-medium text-charcoal"}>
        {legend}
      </legend>
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-sage/30 bg-warm-white p-1">
        {options.map((option) => (
          <label key={option.value} className="relative">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm transition-colors",
                "text-charcoal-light hover:text-charcoal",
                "peer-checked:bg-rose-deep peer-checked:text-white",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rose-deep"
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
