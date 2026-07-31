import DOMPurify from "isomorphic-dompurify";

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
