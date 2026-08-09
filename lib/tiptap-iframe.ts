import { Node } from "@tiptap/core";

export interface IframeOptions {
  allowFullscreen: boolean;
  HTMLAttributes: Record<string, string | number | boolean>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    iframe: {
      setIframe: (options: { src: string; aspect?: string }) => ReturnType;
    };
  }
}

export const Iframe = Node.create<IframeOptions>({
  name: "iframe",

  group: "block",

  atom: true,

  addOptions() {
    return {
      allowFullscreen: true,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
      },
      /**
       * Shape of the embed, as a CSS aspect-ratio value.
       *
       * Previously the wrapper was hardcoded to 16:9. That is right for YouTube
       * and Vimeo and wrong for Instagram: reels and most Instagram posts are
       * portrait, so they were letterboxed into a landscape box with thick bars
       * down both sides — on a channel that is the instructor's entire
       * marketing presence.
       */
      aspect: {
        default: "16 / 9",
        parseHTML: (element) =>
          element.getAttribute("data-aspect") || "16 / 9",
        renderHTML: (attributes) => ({ "data-aspect": attributes.aspect }),
      },
      frameborder: {
        default: 0,
      },
      allowfullscreen: {
        default: this.options.allowFullscreen,
      },
    };
  },

  parseHTML() {
    return [{ tag: "iframe" }];
  },

  renderHTML({ HTMLAttributes }) {
    // Read `data-aspect`, not `aspect`.
    //
    // TipTap builds this object by calling each attribute's own renderHTML and
    // merging the results — and the `aspect` attribute above emits the key
    // `data-aspect`. Destructuring `aspect` here therefore always produced
    // `undefined`, every embed silently fell back to 16:9, and portrait reels
    // stayed letterboxed: the exact bug the attribute was added to fix.
    const { "data-aspect": aspect, ...iframeAttrs } = HTMLAttributes as Record<string, string>;
    const ratio = aspect || "16 / 9";
    // A portrait embed stretched to the full column width would be taller than
    // the viewport, so those are capped and centred; landscape still fills.
    const isPortrait = ratio.startsWith("9");

    return [
      "div",
      {
        class: "relative w-full rounded-xl overflow-hidden my-4",
        style: `aspect-ratio:${ratio};${isPortrait ? "max-width:360px;margin-left:auto;margin-right:auto;" : ""}`,
      },
      [
        "iframe",
        {
          ...iframeAttrs,
          class: "absolute inset-0 w-full h-full",
          width: undefined,
          height: undefined,
        },
      ],
    ];
  },

  addCommands() {
    return {
      setIframe:
        (options: { src: string; aspect?: string }) =>
        ({ tr, dispatch }) => {
          const { selection } = tr;
          const node = this.type.create(options);
          if (dispatch) {
            tr.replaceRangeWith(selection.from, selection.to, node);
          }
          return true;
        },
    };
  },
});
