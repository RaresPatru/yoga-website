/**
 * The videos a post can embed, in one list.
 *
 * Three readers depend on it agreeing with itself:
 *
 * - the editor's video dialog, which turns an address she pastes into an
 *   embed, or explains why it cannot (`embedFromUrl`);
 * - the sanitizer, which keeps a stored <iframe> only if its address is one of
 *   these players (`isAllowedEmbedSrc`, lib/sanitize.ts);
 * - the public pages, which show a placeholder in its place until the visitor
 *   presses play (`sanitizeArticleHtml` in lib/sanitize.ts, drawn by components/rich-html.tsx).
 *
 * Testimonials will read it too (phase 6). The Content-Security-Policy in
 * next.config.ts has to allow each player's origin; tests/sanitize.spec.ts
 * checks the live header against `EMBED_ORIGINS`.
 *
 * Plain functions and data, no DOM, so the test runner and the server can both
 * import it.
 */

export type EmbedProvider = "youtube" | "vimeo" | "instagram" | "tiktok";

export interface Embed {
  provider: EmbedProvider;
  /** The player's address, which goes in the iframe. */
  src: string;
  /** CSS aspect-ratio, width / height. */
  aspect: string;
}

export const PROVIDER_NAMES: Record<EmbedProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** The origins the players load from, for the CSP's frame-src. */
export const EMBED_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://www.youtube.com",
  "https://player.vimeo.com",
  "https://www.instagram.com",
  "https://www.tiktok.com",
] as const;

/**
 * What a stored iframe may point at. Anchored at the start and bounded by a
 * "/" after the host, so a lookalike such as "youtube.com.attacker.example"
 * cannot pass.
 *
 * youtube.com/embed stays allowed because posts saved before 26 September
 * 2026 contain it; `playerSrc` rewrites it to the no-cookie host when the page
 * is drawn.
 */
const ALLOWED_SRC: Record<EmbedProvider, RegExp> = {
  youtube: /^https:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\/[\w-]+/,
  vimeo: /^https:\/\/player\.vimeo\.com\/video\/\d+/,
  instagram: /^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[\w-]+\/embed/,
  tiktok: /^https:\/\/www\.tiktok\.com\/player\/v1\/\d+/,
};

export function embedProvider(src: string): EmbedProvider | null {
  for (const [provider, pattern] of Object.entries(ALLOWED_SRC)) {
    if (pattern.test(src)) return provider as EmbedProvider;
  }
  return null;
}

export function isAllowedEmbedSrc(src: string): boolean {
  return embedProvider(src) !== null;
}

/** Why a pasted address was refused, as a key under `admin.video_error_*`. */
export type EmbedRefusal = "not_a_link" | "map" | "tiktok_short" | "unsupported";

/**
 * Turns an address she copied from the address bar or a Share menu into a
 * player, or says why it cannot.
 *
 * YouTube goes to its no-cookie host, which sets no cookies until the video
 * plays. Shorts, reels and TikToks are portrait; an Instagram post is 4:5,
 * about its shape once Instagram's own header and caption are included.
 */
export function embedFromUrl(input: string): Embed | { refused: EmbedRefusal } {
  const url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    // "youtube.com/watch?v=…" without the scheme is still clearly meant.
    if (/^(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|instagram\.com|tiktok\.com|vm\.tiktok\.com)\//i.test(url)) {
      return embedFromUrl(`https://${url}`);
    }
    return { refused: "not_a_link" };
  }

  const youtube = url.match(
    /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/i
  );
  if (youtube) {
    return {
      provider: "youtube",
      src: `https://www.youtube-nocookie.com/embed/${youtube[1]}`,
      aspect: /\/shorts\//i.test(url) ? "9 / 16" : "16 / 9",
    };
  }

  const vimeo = url.match(/^https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) {
    return { provider: "vimeo", src: `https://player.vimeo.com/video/${vimeo[1]}`, aspect: "16 / 9" };
  }

  const instagram = url.match(/^https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/i);
  if (instagram) {
    const kind = instagram[1].toLowerCase().startsWith("reel") ? "reel" : instagram[1].toLowerCase();
    return {
      provider: "instagram",
      src: `https://www.instagram.com/${kind}/${instagram[2]}/embed`,
      aspect: kind === "p" ? "4 / 5" : "9 / 16",
    };
  }

  const tiktok = url.match(/^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/i);
  if (tiktok) {
    return { provider: "tiktok", src: `https://www.tiktok.com/player/v1/${tiktok[1]}`, aspect: "9 / 16" };
  }
  // The Share button's short links hide the video's number behind a redirect
  // only TikTok can follow.
  if (/^https?:\/\/(vm|vt)\.tiktok\.com\//i.test(url) || /tiktok\.com\/t\//i.test(url)) {
    return { refused: "tiktok_short" };
  }

  if (/^https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url)) {
    return { refused: "map" };
  }

  return { refused: "unsupported" };
}

/**
 * The address the page's player loads, pressed from a placeholder: the
 * no-cookie host for YouTube, and autoplay where the player honours it, since
 * pressing play once should be enough.
 */
export function playerSrc(src: string): string {
  const provider = embedProvider(src);
  let out = src.replace(/^https:\/\/(www\.)?youtube\.com\//, "https://www.youtube-nocookie.com/");
  if (provider === "youtube" || provider === "vimeo") {
    out += (out.includes("?") ? "&" : "?") + "autoplay=1";
  }
  return out;
}

/**
 * The widest a portrait embed may be, so that it is no taller than about
 * 40rem: a 9:16 reel stops at 22.5rem and a 4:5 post at 32rem. Landscape
 * video fills the column. Null for landscape.
 */
export function portraitMaxWidth(aspect: string): string | null {
  const [w, h] = aspect.split("/").map((n) => Number.parseFloat(n));
  if (!w || !h || w >= h) return null;
  return `${Math.round((40 * w * 100) / h) / 100}rem`;
}

/** Aspect ratios an embed may declare; anything else is drawn as 16:9. */
export function safeAspect(aspect: string | null | undefined): string {
  return aspect && /^\d{1,2} \/ \d{1,2}$/.test(aspect) ? aspect : "16 / 9";
}
