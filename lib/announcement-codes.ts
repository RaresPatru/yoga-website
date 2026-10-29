import { versionOf, type AnnouncementTexts } from "@/lib/announcement-version";

/**
 * Finding her discount codes in an announcement.
 *
 * She hands codes out inside announcements, so the site reads each one once
 * it has been sent and records which codes it carried, and in which
 * language's version (lib/stripe-codes.ts writes the record). From that the
 * codes screen can say who received a code before she changes or deletes it,
 * and the Registrations page can show it.
 *
 * WHAT COUNTS AS THE CODE
 *
 * The code as a whole word, in capitals, as the codes screen shows it, its
 * copy button copies it and the editor's Cod menu inserts it. Capitals
 * because a code is often an ordinary word: a code VARA would otherwise be
 * found in every announcement that says "vara" (summer), and YOGA in all of
 * them. A whole word because VARA10 is not VARA10-BONUS. Stripe itself
 * accepts a code in any case at checkout; this is only about recognising one
 * in her writing.
 *
 * Only the text a reader sees is searched: the subject, and the body with its
 * tags taken out, so a code inside a link's address or an attribute is not
 * counted, and one she made bold is.
 */

/** Letters, digits and dashes: every character a code can have. */
const WORD = /[A-Za-z0-9-]+/g;

/** The words in a subject or a body, as a reader sees them. */
export function wordsIn(html: string): Set<string> {
  const text = html.replace(/<[^>]*>/g, " ");
  const words = new Set<string>();
  for (const [word] of text.matchAll(WORD)) {
    words.add(word);
    // A dash against a code in a sentence ("VARA10-" at a line's end) is
    // punctuation, not part of it.
    const trimmed = word.replace(/^-+|-+$/g, "");
    if (trimmed) words.add(trimmed);
  }
  return words;
}

export interface CarriedCode {
  /** The code in capitals. */
  code: string;
  /** In the Romanian version. */
  in_ro: boolean;
  /** In what English readers were sent: the English text, or the Romanian where she wrote none. */
  in_en: boolean;
}

/**
 * Which of `codes` the announcement carried, and in which version. `codes`
 * are the codes as Stripe holds them; each is looked for in capitals.
 */
export function codesCarried(row: AnnouncementTexts, codes: Iterable<string>): CarriedCode[] {
  const seen = (locale: "ro" | "en") => {
    const { subject, body } = versionOf(row, locale);
    return new Set([...wordsIn(subject), ...wordsIn(body)]);
  };
  const ro = seen("ro");
  const en = seen("en");
  const found = new Map<string, CarriedCode>();
  for (const raw of codes) {
    const code = raw.toUpperCase();
    if (!code || found.has(code)) continue;
    const inRo = ro.has(code);
    const inEn = en.has(code);
    if (inRo || inEn) found.set(code, { code, in_ro: inRo, in_en: inEn });
  }
  return [...found.values()];
}
