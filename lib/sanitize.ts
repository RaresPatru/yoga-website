import DOMPurify from "isomorphic-dompurify";

/**
 * Embeds the editor is allowed to produce.
 *
 * Blog posts and event descriptions are written in TipTap and stored as HTML,
 * then rendered with dangerouslySetInnerHTML. DOMPurify strips scripts and
 * event handlers, but the editor needs <iframe> for video — and an iframe with
 * an unrestricted src is its own problem: it can load any page from any domain
 * inside this site's chrome, which is a ready-made phishing surface (a
 * convincing fake login form, framed by the real site).
 *
 * Only the providers actually used for embeds are permitted. Anchored at both
 * ends so a lookalike host such as "youtube.com.attacker.example" cannot match.
 */
const ALLOWED_IFRAME_SRC = [
  /^https:\/\/(www\.)?youtube\.com\/embed\//,
  /^https:\/\/(www\.)?youtube-nocookie\.com\/embed\//,
  /^https:\/\/player\.vimeo\.com\/video\//,
  /^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[\w-]+\/embed/,
];

/**
 * Registered once at module load. DOMPurify keeps hooks on a global instance,
 * so adding this per call would stack duplicates on every render.
 *
 * `uponSanitizeElement` runs for each node as it is processed; removing the
 * node here drops the whole embed rather than leaving a broken empty frame.
 */
DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "iframe") return;

  const element = node as unknown as Element;
  const src = element.getAttribute?.("src") ?? "";

  if (!ALLOWED_IFRAME_SRC.some((pattern) => pattern.test(src))) {
    element.remove?.();
  }
});

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["iframe", "audio", "video"],
    ADD_ATTR: [
      "controls",
      "allow",
      "allowfullscreen",
      "frameborder",
      "poster",
      "preload",
      "playsinline",
      "loading",
      "title",
    ],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}
