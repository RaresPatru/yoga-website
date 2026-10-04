import { cn } from "@/lib/utils";

/*
 * One petal pointing up from the centre of a 100-unit square: it leaves the
 * middle at radius 8, swells, and closes to a point at the rim.
 */
const OUTER_PETAL = "M0 -9 C 10 -19, 11 -35, 0 -47 C -11 -35, -10 -19, 0 -9 Z";
const INNER_PETAL = "M0 -7 C 7 -14, 8 -25, 0 -33 C -8 -25, -7 -14, 0 -7 Z";
const PETALS = 8;

/**
 * A lotus seen from above: eight pale outer petals, eight deeper ones between
 * them, and a green seed head. The drawing only; `.lotus` in app/globals.css
 * turns it and makes its outer petals light up one after another, so it reads
 * as working without a word.
 *
 * Decorative: whatever shows it says in words what is happening.
 */
export function Lotus({ className }: { className?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" aria-hidden="true" focusable="false" className={cn("lotus", className)}>
      {Array.from({ length: PETALS }, (_, i) => (
        <path
          key={`outer-${i}`}
          d={OUTER_PETAL}
          transform={`rotate(${i * (360 / PETALS)})`}
          className="lotus-petal"
          style={{ "--petal": i } as React.CSSProperties}
        />
      ))}
      {Array.from({ length: PETALS }, (_, i) => (
        <path
          key={`inner-${i}`}
          d={INNER_PETAL}
          transform={`rotate(${i * (360 / PETALS) + 180 / PETALS})`}
          className="lotus-inner"
        />
      ))}
      <circle r="7.5" className="lotus-heart" />
    </svg>
  );
}
