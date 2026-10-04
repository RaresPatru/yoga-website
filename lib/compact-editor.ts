import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";

/**
 * The formatting the site-content texts allow: paragraphs, line breaks, bold,
 * italics, bulleted and numbered lists, and links. Nothing else, because
 * these texts sit inside designed pages (the home page's introduction, the
 * About story, the legal documents) where a heading or an embedded video would
 * break the layout around them.
 *
 * One definition for the editor on screen and the headless one the "translate
 * everything" button uses (lib/admin/translate.ts), because the translation
 * copies the Romanian document node for node and both sides have to know the
 * same nodes.
 */
export function compactEditorExtensions() {
  return [
    StarterKit.configure({
      link: false,
      heading: false,
      codeBlock: false,
      code: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
      underline: false,
    }),
    LinkExtension.configure({ openOnClick: false }),
  ];
}
