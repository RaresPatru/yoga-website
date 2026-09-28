/**
 * Lowercase and without diacritics, so "respiratie" finds "Respirație" and
 * "ionut" finds "Ionuț". The admin's searches compare what she types and what
 * they search through in this form; `admin_participants.search_text` is
 * stored in it.
 */
export function searchable(text: string | null | undefined): string {
  return (text ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
