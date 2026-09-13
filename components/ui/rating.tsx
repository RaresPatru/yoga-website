import { Star } from "lucide-react";

/**
 * A star rating, or nothing at all.
 *
 * `null` renders nothing, and that is the point rather than an edge case. The
 * original version of this site drew five filled stars above every quote from a
 * hardcoded array, on a table that had no rating column at all. Fabricated
 * ratings are worse than no ratings: they devalue the genuine reviews beside
 * them, and a page where everything is five stars is a page nobody believes.
 *
 * Lives here rather than inside a page because two pages show testimonials —
 * the home page's three and the full list — and a second copy is how the two
 * start disagreeing about what a rating looks like.
 *
 * A Server Component. There is no state and no interactivity, so this ships no
 * JavaScript.
 */
export function Rating({
  value,
  locale,
  className,
}: {
  value: number | null;
  locale: string;
  className?: string;
}) {
  if (!value) return null;

  const label = locale === "ro" ? `${value} din 5 stele` : `${value} out of 5 stars`;

  return (
    // One accessible name for the group rather than five meaningless icons: a
    // screen reader announces "4 out of 5 stars", not "star star star star".
    // `role="img"` is what makes the label replace the contents rather than be
    // read alongside them.
    <div className={`flex gap-0.5 ${className ?? ""}`} role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={
            star <= value
              ? "h-4 w-4 fill-rose-deep text-rose-deep"
              : "h-4 w-4 text-sage/40"
          }
        />
      ))}
    </div>
  );
}
