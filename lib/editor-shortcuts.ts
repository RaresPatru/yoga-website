/**
 * Every shortcut the blog editor understands, in the order the cheat-sheet
 * lists them.
 *
 * ONE LIST, THREE READERS
 *
 * The cheat-sheet draws it (components/admin/editor-shortcuts.tsx), the
 * toolbar takes its tooltips from it, and tests/admin-blog-editor.spec.ts
 * performs every row against a real editor and checks what comes out. That
 * last reader is what keeps the first two honest. A cheat-sheet promising a
 * shortcut the editor does not have is worse than no cheat-sheet, and the
 * toolbar has done exactly that: its tooltip said "Insert Link (Ctrl+K)" while
 * nothing listened for Ctrl+K, which in Chrome jumps to the address bar.
 *
 * Where the rows come from: TipTap's StarterKit, Link and TextAlign, read from
 * their source at 3.31.3, plus the two lib/blog-editor.ts adds (Ctrl+K and
 * Ctrl+/). An upgrade that renames or drops one fails the spec, not her.
 *
 * Plain data and string functions only, so the test runner can import it
 * without a browser.
 */

export type ShortcutGroup = "headings" | "text" | "blocks" | "alignment" | "more" | "code";

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  "headings",
  "text",
  "blocks",
  "alignment",
  "more",
  "code",
];

/**
 * How a row's result is drawn: with the editor's own typography, so "Titlu 2"
 * appears at the size and weight it will have in the post.
 */
export type ShortcutSample =
  | "h1" | "h2" | "h3" | "p"
  | "strong" | "em" | "s" | "u" | "link" | "code"
  | "ul" | "ol" | "blockquote" | "hr" | "pre"
  | "left" | "center" | "right"
  | "br" | "plain";

export interface Shortcut {
  /** The row's name: `admin.editor.<id>` in messages/*.json, and what tests call it. */
  id: string;
  group: ShortcutGroup;
  /**
   * What to type. `then` is the key that finishes it, for the rules that fire
   * on it (`##` does nothing until the space after it).
   *
   * These work on a phone as well as a computer — they are just characters —
   * which is why the cheat-sheet lists them first.
   */
  typed?: { text: string; then?: "Space" };
  /**
   * Key combinations in ProseMirror's notation (`Mod` is Ctrl, or ⌘ on Apple).
   * Several mean "any of these".
   */
  keys?: readonly string[];
  sample: ShortcutSample;
  /** Carries a one-line note, `admin.editor.<id>_hint`. */
  hint?: boolean;
  /**
   * What the editor must contain once the shortcut has run — the check the
   * spec performs for this row. The editor starts from `start`; key
   * combinations then act on the block the caret is in, or on everything
   * selected when `select` is set. Typed rules always start from an empty
   * editor.
   *
   * Rows without a check do something other than format (undo, open a dialog)
   * and have tests of their own.
   */
  check?: { expect: string; start?: string; select?: boolean };
}

const PLAIN = "<p>Text</p>";

export const SHORTCUTS: readonly Shortcut[] = [
  // Headings. Heading 1 is not in the Format menu (the post's title already
  // is one — see app/admin/blog/page.tsx), but typing `# ` still makes one and
  // Rares decided on 23 September that she may, so it is listed, with a note.
  {
    id: "heading1", group: "headings", sample: "h1", hint: true,
    typed: { text: "#", then: "Space" }, keys: ["Mod-Alt-1"],
    check: { expect: "h1", start: PLAIN },
  },
  {
    id: "heading2", group: "headings", sample: "h2",
    typed: { text: "##", then: "Space" }, keys: ["Mod-Alt-2"],
    check: { expect: "h2", start: PLAIN },
  },
  {
    id: "heading3", group: "headings", sample: "h3",
    typed: { text: "###", then: "Space" }, keys: ["Mod-Alt-3"],
    check: { expect: "h3", start: PLAIN },
  },
  {
    id: "paragraph", group: "headings", sample: "p",
    keys: ["Mod-Alt-0"],
    check: { expect: "p", start: "<h2>Text</h2>" },
  },

  // Text. The asterisks differ from WhatsApp's, where one pair is bold: here
  // one pair is italic and two are bold — hence the note on bold.
  {
    id: "bold", group: "text", sample: "strong", hint: true,
    typed: { text: "**text**" }, keys: ["Mod-b"],
    check: { expect: "strong", start: PLAIN, select: true },
  },
  {
    id: "italic", group: "text", sample: "em",
    typed: { text: "*text*" }, keys: ["Mod-i"],
    check: { expect: "em", start: PLAIN, select: true },
  },
  {
    id: "strike", group: "text", sample: "s",
    typed: { text: "~~text~~" }, keys: ["Mod-Shift-s"],
    check: { expect: "s", start: PLAIN, select: true },
  },
  {
    id: "underline", group: "text", sample: "u", hint: true,
    keys: ["Mod-u"],
    check: { expect: "u", start: PLAIN, select: true },
  },
  // Typing an address and then a space turns it into a link (TipTap's
  // autolink). Ctrl+K opens the link dialog instead, which has its own test.
  {
    id: "link", group: "text", sample: "link",
    typed: { text: "https://…", then: "Space" }, keys: ["Mod-k"],
  },

  // Lists and blocks.
  {
    id: "bullet_list", group: "blocks", sample: "ul",
    typed: { text: "-", then: "Space" }, keys: ["Mod-Shift-8"],
    check: { expect: "ul > li", start: PLAIN },
  },
  {
    id: "ordered_list", group: "blocks", sample: "ol",
    typed: { text: "1.", then: "Space" }, keys: ["Mod-Shift-7"],
    check: { expect: "ol > li", start: PLAIN },
  },
  {
    id: "quote", group: "blocks", sample: "blockquote",
    typed: { text: ">", then: "Space" }, keys: ["Mod-Shift-b"],
    check: { expect: "blockquote", start: PLAIN },
  },
  {
    id: "divider", group: "blocks", sample: "hr",
    typed: { text: "---" },
    check: { expect: "hr" },
  },

  // Alignment. "Left" clears the setting rather than writing
  // `text-align: left`, which is what a paragraph does anyway.
  {
    id: "align_left", group: "alignment", sample: "left",
    keys: ["Mod-Shift-l"],
    check: { expect: "p:not([style])", start: '<p style="text-align: center">Text</p>' },
  },
  {
    id: "align_center", group: "alignment", sample: "center",
    keys: ["Mod-Shift-e"],
    check: { expect: 'p[style*="text-align: center"]', start: PLAIN },
  },
  {
    id: "align_right", group: "alignment", sample: "right",
    keys: ["Mod-Shift-r"],
    check: { expect: 'p[style*="text-align: right"]', start: PLAIN },
  },

  // Everything else. None of these formats anything, so none has a check here.
  { id: "line_break", group: "more", sample: "br", keys: ["Shift-Enter"] },
  { id: "list_indent", group: "more", sample: "plain", keys: ["Tab", "Shift-Tab"] },
  { id: "undo", group: "more", sample: "plain", keys: ["Mod-z"] },
  { id: "redo", group: "more", sample: "plain", keys: ["Mod-Shift-z", "Mod-y"] },
  { id: "shortcuts", group: "more", sample: "plain", keys: ["Mod-/"] },

  // Code, last: a yoga blog rarely wants it, but the editor has it, and a
  // stray pair of backticks produces it whether she knows about it or not.
  {
    id: "code", group: "code", sample: "code",
    typed: { text: "`text`" }, keys: ["Mod-e"],
    check: { expect: "code", start: PLAIN, select: true },
  },
  {
    id: "code_block", group: "code", sample: "pre",
    typed: { text: "```", then: "Space" }, keys: ["Mod-Alt-c"],
    check: { expect: "pre", start: PLAIN },
  },
];

/**
 * Whether ProseMirror reads `Mod` as ⌘ here. The same test prosemirror-keymap
 * applies (`navigator.platform`, iPad included), so a label can never name a
 * key the editor is not actually listening for.
 */
export function isApplePlatform(platform: string): boolean {
  return /Mac|iP(hone|[oa]d)/.test(platform);
}

export interface KeyCap {
  /** What the keycap shows: "Ctrl", "⌘", "B". */
  label: string;
  /** What a screen reader should say, when the label is a symbol. */
  spoken?: string;
}

/** The names a key has in the cheat-sheet that are words rather than symbols. */
export interface KeyWords {
  space: string;
}

/**
 * One combination, as the keycaps to draw, in each platform's own order:
 * Ctrl, Alt, Shift on Windows; ⌥ ⇧ ⌘ on Apple, as its menus print them.
 */
export function keyCaps(combo: string, apple: boolean, words: KeyWords): KeyCap[] {
  const parts = combo.split(/-(?!$)/);
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1).map((m) => m.toLowerCase()));

  const caps: KeyCap[] = [];
  if (apple) {
    if (mods.has("alt")) caps.push({ label: "⌥", spoken: "Option" });
    if (mods.has("shift")) caps.push({ label: "⇧", spoken: "Shift" });
    if (mods.has("mod")) caps.push({ label: "⌘", spoken: "Command" });
  } else {
    if (mods.has("mod")) caps.push({ label: "Ctrl" });
    if (mods.has("alt")) caps.push({ label: "Alt" });
    if (mods.has("shift")) caps.push({ label: "Shift" });
  }
  caps.push({ label: key === "Space" ? words.space : key.length === 1 ? key.toUpperCase() : key });
  return caps;
}

/** "Ctrl+Alt+2" or "⌥⌘2", for a tooltip. */
export function keyText(combo: string, apple: boolean, words: KeyWords): string {
  return keyCaps(combo, apple, words)
    .map((cap) => cap.label)
    .join(apple ? "" : "+");
}

/**
 * The same combination for `aria-keyshortcuts`, which wants the key names of
 * the UI Events spec ("Control+Alt+2") rather than anything localised.
 */
export function ariaKeys(combo: string, apple: boolean): string {
  const parts = combo.split(/-(?!$)/);
  const key = parts[parts.length - 1];
  const out: string[] = [];
  for (const mod of parts.slice(0, -1)) {
    const m = mod.toLowerCase();
    if (m === "mod") out.push(apple ? "Meta" : "Control");
    else if (m === "alt") out.push("Alt");
    else if (m === "shift") out.push("Shift");
  }
  out.push(key === "Space" ? "Space" : key.length === 1 ? key.toUpperCase() : key);
  return out.join("+");
}

/** Look a row up by id; throws on a typo rather than drawing nothing. */
export function shortcut(id: string): Shortcut {
  const found = SHORTCUTS.find((s) => s.id === id);
  if (!found) throw new Error(`No editor shortcut called "${id}"`);
  return found;
}
