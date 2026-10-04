/**
 * Her rich text as plain text.
 *
 * Titles and descriptions are written in TipTap and stored as HTML, and there
 * are places that need the words without the markup: a meta description, a
 * card that prints a summary as text, a calendar entry. Those places had
 * drifted apart — the home carousel card printed `description_ro` straight
 * into a paragraph, so a description with tags in it showed its angle brackets
 * on the card and rendered as formatted HTML one click later on the event page.
 *
 * Shared rather than copied, so there is one answer to "what do her words look
 * like without markup" instead of one per surface.
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp: "&",
};

/**
 * Turns the entities HTML stores text with back into characters: `&lt;` into
 * `<`, `&#039;` into `'`. One pass, so `&amp;lt;` becomes the text `&lt;` and
 * not `<`. Only `&nbsp;` and `&amp;` used to be decoded, so a description
 * mentioning "5 < 6" reached search results as "5 &lt; 6" (audit B28).
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name.startsWith("#")) {
      const hex = name[1] === "x" || name[1] === "X";
      const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? match;
  });
}

/** The words on one line, for a meta description or a card. */
export function toPlainText(html: string | null | undefined): string {
  if (!html) return "";

  return decodeEntities(html.replace(/<[^>]*>/g, " ")) // TipTap stores rich text; tags must not leak
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The words with their paragraphs kept, a blank line between each: for a
 * calendar entry's description, where one run-on line would lose the shape
 * of what she wrote.
 */
export function toPlainParagraphs(html: string | null | undefined): string {
  if (!html) return "";

  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, "\n\n")
      .replace(/<[^>]*>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
