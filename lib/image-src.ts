/**
 * Whether next/image may optimise a picture at this address.
 *
 * The optimiser only fetches from the hosts listed under `images` in
 * next.config.ts, and for any other host next/image does not fall back: it
 * throws, and the page it is on fails to render. Pictures inside a post can
 * come from anywhere text can be pasted from, and the first of them becomes
 * the card's and the article's picture, so one outside image took down both
 * the article and the /blog list while this was being built.
 *
 * Anything this says no to is drawn with `unoptimized`, which skips the
 * optimiser (and its host check) and shows the file as it is.
 *
 * Keep in step with `images.remotePatterns` in next.config.ts.
 */
export function canOptimise(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    const url = new URL(src);
    return (
      url.protocol === "https:" &&
      (url.hostname.endsWith(".supabase.co") || url.hostname === "media.istockphoto.com")
    );
  } catch {
    return false;
  }
}
