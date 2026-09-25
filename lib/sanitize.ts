import DOMPurify from "isomorphic-dompurify";
import {
  PROVIDER_NAMES,
  embedProvider,
  isAllowedEmbedSrc,
  portraitMaxWidth,
  safeAspect,
} from "@/lib/embeds";

/**
 * Blog posts, event descriptions and her site copy are written in TipTap and
 * stored as HTML, then rendered with dangerouslySetInnerHTML. DOMPurify strips
 * scripts and event handlers, but the editor needs <iframe> for video, and an
 * iframe with an unrestricted src is its own problem: it can load any page from
 * any domain inside this site's chrome, which is a ready-made phishing surface
 * (a convincing fake login form, framed by the real site).
 *
 * So a frame survives only if it points at one of the video players in
 * lib/embeds.ts. Registered once at module load: DOMPurify keeps hooks on a
 * global instance, so adding this per call would stack duplicates.
 * Removing the node drops the whole embed rather than leaving an empty frame.
 */
DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "iframe") return;
  const element = node as unknown as Element;
  if (!isAllowedEmbedSrc(element.getAttribute?.("src") ?? "")) {
    element.remove?.();
  }
});

const OPTIONS = {
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
};

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, OPTIONS);
}

/** The words on a video placeholder, in the page's language. */
export interface EmbedLabels {
  /** "Pornește videoul de pe {provider}" */
  play: string;
  /** "Până atunci, {provider} nu primește nimic de la tine." */
  note: string;
}

/**
 * Sanitized HTML with every video replaced by a placeholder that loads it only
 * when pressed. For public pages.
 *
 * WHY
 *
 * A YouTube, Vimeo, Instagram or TikTok frame contacts that company as the
 * page loads, and may set its cookies, before the visitor has shown any
 * interest in the video. EU rules treat those as non-essential cookies, which
 * need consent first: a banner. A placeholder asks by being pressed, so the
 * site needs no banner (docs/PRIVACY.md). It also spares a phone on mobile
 * data the half a megabyte each player costs.
 *
 * There is no thumbnail on the placeholder, because fetching one from YouTube
 * would already tell YouTube who is reading. The stored HTML keeps the real
 * <iframe>, so the editor shows the video itself and nothing is lost if this
 * ever changes. components/rich-html.tsx swaps the frame in on the press.
 */
export function sanitizeArticleHtml(html: string, labels: EmbedLabels): string {
  const fragment = DOMPurify.sanitize(html, { ...OPTIONS, RETURN_DOM_FRAGMENT: true });
  const doc = fragment.ownerDocument;

  for (const frame of Array.from(fragment.querySelectorAll("iframe"))) {
    const src = frame.getAttribute("src") ?? "";
    const provider = embedProvider(src);
    if (!provider) {
      frame.remove();
      continue;
    }

    // The editor wraps each frame in a <div> that carries its shape. Older
    // posts have a bare frame, or a shape only on the wrapper's style.
    const parent = frame.parentElement;
    const wrapped = parent?.tagName === "DIV" && parent.children.length === 1;
    const aspect = safeAspect(
      frame.getAttribute("data-aspect") ??
        (wrapped ? parent!.getAttribute("style")?.match(/aspect-ratio:\s*([\d.]+ \/ [\d.]+)/)?.[1] : null)
    );
    const maxWidth = portraitMaxWidth(aspect);
    const name = PROVIDER_NAMES[provider];

    const facade = doc.createElement("figure");
    // `not-prose`: the article typography styles figures and buttons, and
    // this is neither of the kinds it means.
    facade.className = "not-prose embed-facade";
    facade.setAttribute("data-embed-src", src);
    facade.setAttribute("data-embed-title", frame.getAttribute("title") || name);
    facade.setAttribute("style", `aspect-ratio:${aspect};${maxWidth ? `max-width:${maxWidth};` : ""}`);

    const button = doc.createElement("button");
    button.setAttribute("type", "button");
    button.setAttribute("data-embed-play", "");
    button.className = "embed-facade-play";

    const icon = doc.createElement("span");
    icon.className = "embed-facade-icon";
    icon.setAttribute("aria-hidden", "true");

    const title = doc.createElement("span");
    title.className = "embed-facade-title";
    title.textContent = labels.play.replace("{provider}", name);

    const note = doc.createElement("span");
    note.className = "embed-facade-note";
    note.textContent = labels.note.replace("{provider}", name);

    button.append(icon, title, note);
    facade.append(button);
    (wrapped ? parent! : frame).replaceWith(facade);
  }

  const holder = doc.createElement("div");
  holder.append(fragment);
  return holder.innerHTML;
}
