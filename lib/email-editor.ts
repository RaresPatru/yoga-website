import { Extension, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";

/**
 * The editors for an email's subject and text (/admin/emails).
 *
 * WHAT AN EMAIL MAY HOLD
 *
 * Paragraphs, one heading size, bold, italics, lists and links: what every
 * email client draws the same way. Nothing else can be typed or pasted in,
 * because an email is not a web page. Underline is left out on purpose, since
 * in an email it reads as a link.
 *
 * THE PLACEHOLDERS
 *
 * A stored template says {{event_name}} where the event's name goes. In the
 * editor each one is a chip with a plain name ("Eveniment"), inserted where
 * the caret is and deleted in one keystroke, so a placeholder cannot be half
 * typed or misspelled. On the way in, toEditorHtml() turns each {{name}} in
 * the text into a chip; on the way out, fromEditorHtml() turns each chip back.
 * Links keep theirs in the address: a link to {{claim_url}} is a link whose
 * address is filled in when the email is sent.
 *
 * AN EVENT CARD
 *
 * An announcement can hold events, each drawn in the email as a card with its
 * photo, date and a button to its page (lib/email-layout.ts). In the editor it
 * is one block with the event's name, which moves and deletes as a whole.
 */

export interface EmailEditorOptions {
  /** A placeholder's name as the chip shows it, in the panel's language. */
  label: (name: string) => string;
  /** For announcements: an event card's title and date, by the event's id. */
  describeEvent?: (id: string) => { title: string; when: string } | null;
  /** The accessible name of a card's remove button. */
  removeEventLabel?: string;
}

const PLACEHOLDER_ADDRESS = /^\{\{\s*\w+\s*\}\}$/;

/** A placeholder in the text, drawn as a chip. */
const EmailVariable = Node.create<{ label: (name: string) => string }>({
  name: "emailVariable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { label: (name: string) => name };
  },

  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-variable") ?? "",
        renderHTML: (attributes) => ({ "data-variable": attributes.name }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-variable]" }];
  },

  // What getHTML() and the translator see: the placeholder itself.
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), `{{${node.attrs.name}}}`];
  },

  renderText({ node }) {
    return `{{${node.attrs.name}}}`;
  },

  // What she sees: the placeholder's plain name.
  addNodeView() {
    const label = this.options.label;
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "email-chip";
      dom.contentEditable = "false";
      dom.setAttribute("data-variable", node.attrs.name);
      dom.textContent = label(node.attrs.name);
      return { dom };
    };
  },
});

/** An event, drawn in the email as a card. */
const EmailEventCard = Node.create<{
  describe: (id: string) => { title: string; when: string } | null;
  removeLabel: string;
}>({
  name: "emailEventCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { describe: () => null, removeLabel: "Remove" };
  },

  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-event-card") ?? "",
        renderHTML: (attributes) => ({ "data-event-card": attributes.id }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-event-card]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    const { describe, removeLabel } = this.options;
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div");
      dom.className = "email-event-node";
      dom.contentEditable = "false";
      const about = describe(node.attrs.id);

      const text = document.createElement("div");
      text.className = "email-event-node-text";
      const title = document.createElement("p");
      title.className = "email-event-node-title";
      title.textContent = about?.title ?? "…";
      const when = document.createElement("p");
      when.className = "email-event-node-when";
      when.textContent = about?.when ?? "";
      text.append(title, when);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "email-event-node-remove";
      remove.setAttribute("aria-label", removeLabel);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos === "number") {
          editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
        }
      });

      dom.append(text, remove);
      return { dom };
    };
  },
});

/** The text of an email: see the file's comment for what it allows. */
export function emailBodyExtensions(options: EmailEditorOptions) {
  return [
    StarterKit.configure({
      link: false,
      heading: { levels: [2] },
      codeBlock: false,
      code: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
      underline: false,
    }),
    LinkExtension.configure({
      openOnClick: false,
      // The stored HTML stays plain: the layout decides how a link looks.
      HTMLAttributes: { target: null, rel: null, class: null },
      // A placeholder is an address too: it is filled in when the email goes.
      isAllowedUri: (url, ctx) => PLACEHOLDER_ADDRESS.test(url) || ctx.defaultValidate(url),
    }),
    EmailVariable.configure({ label: options.label }),
    ...(options.describeEvent
      ? [EmailEventCard.configure({ describe: options.describeEvent, removeLabel: options.removeEventLabel ?? "Remove" })]
      : []),
  ];
}

/** A document of exactly one paragraph, for the subject line. */
const OneLine = Node.create({ name: "doc", topNode: true, content: "paragraph" });

/** Enter does nothing in a subject: a subject is one line. */
const NoNewLines = Extension.create({
  name: "noNewLines",
  addKeyboardShortcuts() {
    return { Enter: () => true, "Shift-Enter": () => true, "Mod-Enter": () => true };
  },
});

/** The subject: words and placeholders on one line, no formatting. */
export function emailSubjectExtensions(options: Pick<EmailEditorOptions, "label">) {
  return [
    StarterKit.configure({
      document: false,
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      hardBreak: false,
      bold: false,
      italic: false,
      strike: false,
      underline: false,
      link: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
    }),
    OneLine,
    NoNewLines,
    EmailVariable.configure({ label: options.label }),
  ];
}

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/** Text with each {{name}} turned into a chip, as DOM nodes of `doc`. */
function withChips(doc: Document, value: string): (string | HTMLElement)[] {
  const parts: (string | HTMLElement)[] = [];
  let last = 0;
  for (const match of value.matchAll(PLACEHOLDER)) {
    parts.push(value.slice(last, match.index));
    const chip = doc.createElement("span");
    chip.setAttribute("data-variable", match[1]);
    parts.push(chip);
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(value.slice(last));
  return parts.filter((part) => part !== "");
}

/**
 * A stored template's HTML as the editor loads it: each {{name}} in the text
 * becomes a chip. Browser only; parsed into an inert document, so nothing in
 * it loads or runs.
 */
export function toEditorHtml(stored: string): string {
  if (!stored.trim()) return "";
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${stored}</body>`, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const node of texts) {
    if (!node.data.includes("{{")) continue;
    node.replaceWith(...withChips(doc, node.data));
  }
  return doc.body.innerHTML;
}

/** A stored subject (plain text) as the one-line editor loads it. */
export function subjectToEditorHtml(subject: string): string {
  const doc = new DOMParser().parseFromString("<!doctype html><body><p></p></body>", "text/html");
  doc.body.firstElementChild!.append(...withChips(doc, subject));
  return doc.body.innerHTML;
}

/** The editor's HTML as it is stored: each chip back to {{name}}. */
export function fromEditorHtml(html: string): string {
  return html.replace(/<span\b[^>]*data-variable="(\w+)"[^>]*>[\s\S]*?<\/span>/g, "{{$1}}");
}
