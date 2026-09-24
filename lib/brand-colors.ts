/**
 * The brand colours as hex values, for the places CSS variables cannot reach:
 * the share images drawn by next/og, and email HTML.
 *
 * They must stay equal to the `--color-*` tokens in app/globals.css, which are
 * the source of truth. tests/brand-colors.spec.ts compares the two, because a
 * copy kept by hand had already drifted: the share images used a rose that the
 * rest of the site had stopped using.
 */
export const BRAND = {
  cream: "#FFF8F0",
  sage: "#9CAF88",
  sageDeep: "#5F7049",
  roseDeep: "#A94E67",
  charcoal: "#2D2D2D",
  charcoalLight: "#4A4A4A",
} as const;

/** The globals.css token each value above must equal. */
export const BRAND_TOKENS: Record<keyof typeof BRAND, string> = {
  cream: "--color-cream",
  sage: "--color-sage",
  sageDeep: "--color-sage-deep",
  roseDeep: "--color-rose-deep",
  charcoal: "--color-charcoal",
  charcoalLight: "--color-charcoal-light",
};
