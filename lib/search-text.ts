/**
 * Lowercase and without diacritics, so "respiratie" finds "Respirație" and
 * "ionut" finds "Ionuț". The admin's searches compare what she types and what
 * they search through in this form; `admin_participants.search_text` and
 * `contact_messages.search_text` are stored in it.
 */
export function searchable(text: string | null | undefined): string {
  return (text ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * What she typed as a LIKE pattern matching it anywhere in a `search_text`
 * column: in the searchable form, with `%` and `_` meant literally rather
 * than as LIKE's wildcards. Null for an empty box.
 */
export function containsPattern(q: string): string | null {
  const words = searchable(q.trim());
  if (!words) return null;
  return `%${words.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
