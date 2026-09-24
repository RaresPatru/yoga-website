/**
 * Turns whatever she typed into a link that opens her account.
 *
 * The social fields in the admin panel are free text, and the
 * person filling them in is not thinking about URLs. The realistic inputs are
 * all of these, and they all have to work:
 *
 *   https://www.instagram.com/nume     pasted from the address bar
 *   instagram.com/nume                 pasted without the scheme
 *   www.facebook.com/pagina            the same, with a www
 *   @nume                              how a handle is written everywhere else
 *   nume                               just the name
 *
 * The second and third are the dangerous ones. `href="instagram.com/nume"` is a
 * *relative* path, so the browser resolves it against this site and the link
 * 404s on our own domain — it looks typed-in-correctly and is completely broken,
 * which is exactly the kind of thing nobody notices until a visitor mentions it.
 *
 * Returns null when the field is empty, which is what lets the footer leave the
 * icon out altogether rather than rendering one that goes nowhere.
 */

export type SocialNetwork = "instagram" | "facebook" | "tiktok" | "linkedin";

/**
 * Where a bare name leads. TikTok keeps the @ in its addresses, and a bare name
 * on LinkedIn is read as a personal profile (/in/); a company page has to be
 * pasted as an address.
 */
const PROFILE_BASE: Record<SocialNetwork, string> = {
  instagram: "https://www.instagram.com/",
  facebook: "https://www.facebook.com/",
  tiktok: "https://www.tiktok.com/@",
  linkedin: "https://www.linkedin.com/in/",
};

/** Addresses that are already the real thing and only want a scheme in front. */
const NETWORK_HOST: Record<SocialNetwork, RegExp> = {
  instagram: /^(?:\/\/)?(?:www\.)?instagram\.com\/.+/i,
  facebook: /^(?:\/\/)?(?:www\.|m\.)?(?:facebook\.com|fb\.com|fb\.me)\/.+/i,
  tiktok: /^(?:\/\/)?(?:www\.|m\.)?tiktok\.com\/.+/i,
  linkedin: /^(?:\/\/)?(?:[a-z]{2,3}\.|www\.)?linkedin\.com\/.+/i,
};

export function socialUrl(
  value: string | null | undefined,
  network: SocialNetwork
): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  // Only http and https are handed back untouched. Everything else falls
  // through to the handle branch below, so a `javascript:` or `data:` string
  // pasted into the field can never reach an href — it just becomes a profile
  // path that does not exist.
  if (/^https?:\/\//i.test(raw)) return raw;

  if (NETWORK_HOST[network].test(raw)) {
    return `https://${raw.replace(/^\/\//, "")}`;
  }

  // A username. Strip the decoration people put around one, then encode it:
  // a handle cannot contain a slash, so encoding cannot break a valid value and
  // does stop an invalid one from climbing out of the profile path.
  const handle = raw.replace(/^[@/\s]+/, "").replace(/\/+$/, "");
  if (!handle) return null;

  return PROFILE_BASE[network] + encodeURIComponent(handle);
}
