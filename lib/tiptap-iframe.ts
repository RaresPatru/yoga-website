import { Node } from "@tiptap/core";
import { portraitMaxWidth, safeAspect } from "@/lib/embeds";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    iframe: {
      setIframe: (options: { src: string; aspect?: string; title?: string }) => ReturnType;
    };
  }
}

/**
 * A video embedded in a post: a YouTube, Vimeo, Instagram or TikTok player
 * (lib/embeds.ts decides which addresses qualify).
 *
 * Stored as a <div> that gives the video its shape, around the <iframe>:
 *
 *   <div style="aspect-ratio:9 / 16;max-width:22.5rem;…">
 *     <iframe src="…" data-aspect="9 / 16" title="…"></iframe>
 *   </div>
 *
 * THE SHAPE IS WRITTEN TWICE, ON PURPOSE
 *
 * The wrapper's style is what the page draws. The iframe's `data-aspect` is
 * what the editor reads back when the post is opened again, because TipTap
 * parses the <iframe>, not its wrapper. Until 26 September 2026 only the style
 * was written, so every portrait reel came back as 16:9 the first time its
 * post was re-saved (audit B34). Posts saved in that window have no
 * `data-aspect`; `parseHTML` reads their wrapper's style instead.
 *
 * Portrait embeds are capped in width so that none is taller than about
 * 40rem, which also sizes a 4:5 Instagram post properly (audit B26: only
 * shapes starting with "9" used to be capped).
 */
export const Iframe = Node.create({
  name: "iframe",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
        // Old posts point at youtube.com; the no-cookie host plays the same
        // video without setting cookies before it is pressed.
        parseHTML: (element) =>
          element
            .getAttribute("src")
            ?.replace(/^https:\/\/(www\.)?youtube\.com\/embed\//, "https://www.youtube-nocookie.com/embed/") ?? null,
      },
      aspect: {
        default: "16 / 9",
        parseHTML: (element) =>
          safeAspect(
            element.getAttribute("data-aspect") ??
              element.parentElement?.getAttribute("style")?.match(/aspect-ratio:\s*([\d.]+ \/ [\d.]+)/)?.[1]
          ),
        renderHTML: (attributes) => ({ "data-aspect": attributes.aspect }),
      },
      title: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: "iframe" }];
  },

  renderHTML({ HTMLAttributes }) {
    const { "data-aspect": aspect, ...rest } = HTMLAttributes as Record<string, string>;
    const ratio = safeAspect(aspect);
    const maxWidth = portraitMaxWidth(ratio);

    return [
      "div",
      {
        class: "relative my-6 w-full overflow-hidden rounded-xl",
        style: `aspect-ratio:${ratio};${maxWidth ? `max-width:${maxWidth};margin-left:auto;margin-right:auto;` : ""}`,
      },
      [
        "iframe",
        {
          ...rest,
          "data-aspect": ratio,
          class: "absolute inset-0 h-full w-full",
          allowfullscreen: "true",
          loading: "lazy",
        },
      ],
    ];
  },

  addCommands() {
    return {
      setIframe:
        (options) =>
        ({ tr, dispatch }) => {
          const node = this.type.create(options);
          if (dispatch) tr.replaceRangeWith(tr.selection.from, tr.selection.to, node);
          return true;
        },
    };
  },
});
