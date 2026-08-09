import { ImageIcon } from "lucide-react";

/**
 * Marks content the instructor has not supplied yet.
 *
 * The brief asked for placeholders that are clearly marked rather than
 * invisible, and the reasoning is worth stating: the previous home page filled
 * its gaps with invented facts — "10+ years · 500+ classes · 1000+ students" —
 * which look like finished content and are therefore never questioned. Nobody
 * notices a lie that looks polished. A visible gap gets filled.
 *
 * The styling is deliberately restrained: a dashed outline and muted text. It
 * reads as "not finished yet" to anyone who knows the site, without shouting
 * PLACEHOLDER at a visitor who happens to arrive early. Every one of these is
 * listed in docs/CONTENT-NEEDED.md.
 */

interface TextPlaceholderProps {
  /** What is missing, in Romanian — she is the one who reads this. */
  label: string;
  className?: string;
}

export function TextPlaceholder({ label, className = "" }: TextPlaceholderProps) {
  return (
    <span
      className={`inline-block rounded-lg border border-dashed border-sage/50 bg-sage/5 px-3 py-1.5 text-sm text-charcoal-light ${className}`}
      data-placeholder="true"
    >
      {label}
    </span>
  );
}

interface ImagePlaceholderProps {
  label: string;
  /** Tailwind aspect ratio class, e.g. "aspect-[3/4]". */
  aspect?: string;
  className?: string;
}

export function ImagePlaceholder({
  label,
  aspect = "aspect-[3/4]",
  className = "",
}: ImagePlaceholderProps) {
  return (
    <div
      className={`flex ${aspect} w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-sage/40 bg-gradient-to-br from-sage/10 to-blush/10 p-6 text-center ${className}`}
      data-placeholder="true"
    >
      <ImageIcon className="h-8 w-8 text-sage-deep/60" aria-hidden="true" />
      <p className="max-w-[22ch] text-sm text-charcoal-light">{label}</p>
    </div>
  );
}
