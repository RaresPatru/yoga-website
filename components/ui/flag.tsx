/**
 * A country flag, as an SVG served from /flags.
 *
 * This replaced flag emoji, which cost nothing and looked perfect on iOS and
 * Android — and rendered as the bare letters "RO" on Windows, which ships no
 * flag glyphs. The visitors are on phones, but the instructor runs the admin
 * panel from a desktop, so "correct on mobile only" was not good enough.
 *
 * The files are copied out of the country-flag-icons package at build time by
 * scripts/copy-flags.mjs. Plain <img> rather than next/image on purpose: these
 * are 1–3KB static SVGs, so the optimiser has nothing to optimise and would
 * only add a round trip through /_next/image.
 *
 * Decorative by default. A flag next to a country name or a language code says
 * nothing the adjacent text does not already say, and an alt text here makes a
 * screen reader announce "Romania Romania". Pass an `alt` only where the flag
 * is the *only* label, which should be rare.
 */
export function Flag({
  code,
  className,
  alt = "",
}: {
  /** ISO 3166-1 alpha-2, any case. */
  code: string;
  className?: string;
  alt?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see the note above
    <img
      src={`/flags/${code.toUpperCase()}.svg`}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      width={20}
      height={14}
      loading="lazy"
      decoding="async"
      className={className ?? "h-3.5 w-5 shrink-0 rounded-[2px] object-cover"}
    />
  );
}
