/**
 * Her rich text as plain text.
 *
 * Titles and descriptions are written in TipTap and stored as HTML, and there
 * are places that need the words without the markup: a meta description, and
 * any card that prints a summary as text rather than rendering it. Those places
 * had drifted apart — the home carousel card printed `description_ro` straight
 * into a paragraph, so a description with tags in it showed its angle brackets
 * on the card and rendered as formatted HTML one click later on the event page.
 *
 * Shared rather than copied, so there is one answer to "what do her words look
 * like without markup" instead of one per surface.
 */
export function toPlainText(html: string | null | undefined): string {
  if (!html) return "";

  return html
    .replace(/<[^>]*>/g, " ") // TipTap stores rich text; tags must not leak
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
