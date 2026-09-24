import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { Iframe } from "@/lib/tiptap-iframe";

/**
 * The heading levels a blog post may contain: 1, 2 and 3.
 *
 * Deeper levels are left out on purpose. At body size an H4 reads as a bold
 * paragraph, and H5 and H6 add nothing a two-level outline under the title
 * needs. The limit is on TipTap's schema, not only the menu, so a heading
 * pasted in at level 4 to 6 arrives as a paragraph rather than as a level the
 * toolbar cannot name.
 */
export const HEADING_LEVELS = [1, 2, 3] as const;

/**
 * Left, centre and right — no justify.
 *
 * Justified text is spaced out line by line to meet both margins, and in a
 * column as narrow as a phone's, with long Romanian words and no hyphenation
 * to break them, that spacing turns into gaps you can see across the page.
 * Almost every visitor reads on a phone.
 *
 * A pasted paragraph that was justified arrives left-aligned, because TipTap
 * only reads back the alignments listed here.
 */
export const ALIGNMENTS = ["left", "center", "right"] as const;

/**
 * Alignment for paragraphs and headings, stored as
 * `style="text-align: center"` on the element.
 *
 * WHY A STYLE ATTRIBUTE
 *
 * It is what TipTap writes, and it survives everywhere the HTML goes: the
 * sanitizer keeps `style` (see lib/sanitize.ts), the CSP allows inline styles,
 * and the video embeds already depend on both. A class would need the matching
 * CSS to exist on every page that ever shows a post.
 *
 * The shortcuts are replaced rather than inherited so that "left" clears the
 * setting instead of writing `text-align: left`, which is what a paragraph
 * does with no setting at all — ordinary paragraphs stay bare `<p>`s. TipTap's
 * Ctrl+Shift+J for justify goes with them; it could only ever have failed.
 */
const Alignment = TextAlign.extend({
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-l": () => this.editor.commands.unsetTextAlign(),
      "Mod-Shift-e": () => this.editor.commands.setTextAlign("center"),
      "Mod-Shift-r": () => this.editor.commands.setTextAlign("right"),
    };
  },
}).configure({ types: ["heading", "paragraph"], alignments: [...ALIGNMENTS] });

/** Fired on the editor's element when she asks for the link dialog. */
export const LINK_REQUEST = "blog-editor:link";
/** Fired on the editor's element when she asks for the shortcut list. */
export const SHORTCUTS_REQUEST = "blog-editor:shortcuts";
/** Fired on the editor's element when she presses Escape. */
export const ESCAPE_REQUEST = "blog-editor:escape";

/**
 * Ctrl+K for a link and Ctrl+/ for the shortcut list — the conventions of
 * Google Docs, which she is most likely to have met — and Escape.
 *
 * All three concern things that live in React, which an extension cannot
 * reach, so they announce themselves as a DOM event on the editor's own
 * element and the component around it listens
 * (components/admin/rich-text-editor.tsx). A listener that acts calls
 * `preventDefault()`, and only then does the editor claim the key; with nobody
 * listening, the key goes on to the browser as if the editor were not there.
 *
 * WHY ESCAPE NEEDS HANDLING AT ALL
 *
 * The shortcut list is a popover, and a popover closes itself on Escape — but
 * only an Escape nobody has cancelled, and ProseMirror cancels every Escape
 * pressed inside the editor (`captureKeyDown` in prosemirror-view). So with
 * the list opened by Ctrl+/ and the caret still in her sentence, Escape did
 * nothing at all. Measured, not assumed: tests/admin-blog-editor.spec.ts.
 *
 * WHY THE LOW PRIORITY
 *
 * Extensions register their keys in priority order, the default being 100,
 * and the first that handles a key wins. On keyboards where "/" is Shift+7
 * (German, and others) Ctrl+/ and the numbered-list shortcut Ctrl+Shift+7 are
 * the same keypress. Listening last lets the list have it there; on layouts
 * with a real "/" key nothing else wants the combination.
 */
const EditorRequests = Extension.create({
  name: "editorRequests",
  priority: 10,
  addKeyboardShortcuts() {
    // dispatchEvent returns false when a listener called preventDefault().
    const request = (type: string) => () =>
      !this.editor.view.dom.dispatchEvent(new CustomEvent(type, { bubbles: true, cancelable: true }));
    return {
      "Mod-k": request(LINK_REQUEST),
      "Mod-/": request(SHORTCUTS_REQUEST),
      Escape: request(ESCAPE_REQUEST),
    };
  },
});

/**
 * One definition for both of the post's editors, Romanian and English.
 *
 * They have to share it: the translation copies the Romanian document into the
 * English editor node for node (lib/translate-document.ts), which only works if
 * both understand exactly the same nodes and attributes.
 */
export function blogEditorExtensions() {
  return [
    StarterKit.configure({
      link: false,
      heading: { levels: [...HEADING_LEVELS] },
      /*
       * TipTap keeps an empty paragraph at the very end of the document, so
       * there is always somewhere to click after the last block. Here it only
       * does so after images, embeds and dividers, which nothing can be typed
       * into; after a heading, list, quote or code block, Enter already leads
       * out.
       *
       * The narrower rule is what makes Backspace undo an automatic format at
       * the end of a post, where she mostly writes. TipTap remembers the last
       * one until the document next changes, and the empty paragraph it
       * appended after a new `## ` heading was that change: Backspace then
       * found nothing to undo and turned the heading into an empty paragraph,
       * "##" gone. The shortcut list promises the undo, and the spec checks it
       * for every typed shortcut.
       */
      trailingNode: { notAfter: ["heading", "bulletList", "orderedList", "blockquote", "codeBlock"] },
    }),
    ImageExtension,
    LinkExtension.configure({ openOnClick: false }),
    Iframe,
    Alignment,
    EditorRequests,
  ];
}

/**
 * Stored text that predates the English editor, turned into paragraphs.
 *
 * Until 23 September the English body was a plain `<textarea>`, so older posts
 * hold text with line breaks and no tags. Handed to TipTap as it is, every
 * line would run together into one paragraph — the same wall of text the
 * public page shows for it. Blank lines become paragraph breaks and single
 * ones line breaks, which is what she meant by them.
 *
 * Anything that already contains a tag is left alone: that is HTML, written by
 * an editor. "<3" is not a tag — a tag name starts with a letter.
 */
export function toEditorContent(stored: string | null | undefined): string {
  const text = stored ?? "";
  if (!text.trim() || /<[a-z][^>]*>/i.test(text)) return text;

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.split("\n").map(escape).join("<br>")}</p>`)
    .join("");
}
