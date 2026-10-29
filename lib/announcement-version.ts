/**
 * What an announcement says in each language, as its readers are sent it.
 *
 * An English reader gets the English subject and the English text where she
 * wrote them, and the Romanian where she did not, each on its own: an
 * English subject over a Romanian text is possible. The send builds every
 * email from this (lib/announcements.ts), and the search for discount codes
 * reads exactly the same thing (lib/announcement-codes.ts), so a code counts
 * as received only by the people whose version carried it.
 */

export interface AnnouncementTexts {
  subject_ro: string;
  subject_en: string | null;
  body_ro: string;
  body_en: string | null;
}

/** Whether a text has anything a reader would see: words, or an event card. */
export function hasWords(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim() !== "" || /data-event-card=/.test(html);
}

/** The subject and the text a reader in `locale` is sent. */
export function versionOf(row: AnnouncementTexts, locale: "ro" | "en"): { subject: string; body: string } {
  return {
    subject: (locale === "en" && row.subject_en?.trim()) || row.subject_ro,
    body: (locale === "en" && row.body_en?.trim() && hasWords(row.body_en) && row.body_en) || row.body_ro,
  };
}
