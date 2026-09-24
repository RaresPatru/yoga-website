/**
 * The form of a sentence that fits a count, in the admin's language.
 *
 * Romanian has three plural forms where English has two:
 *
 *   one    1 plată în așteptare
 *   few    2 plăți în așteptare       (2 to 19, and 101 to 119, 201 to 219, …)
 *   other  20 de plăți în așteptare   (20 and up, where "de" joins the count)
 *
 * Intl.PluralRules knows which applies to a number, so the messages only spell
 * out each form (`admin.dash.payments.one`, `.few`, `.other`) and nothing here
 * encodes the grammar. English uses `one` and `other`.
 *
 * Zero is picked out before the rules are asked, because the dashboard says
 * something different when nothing is waiting ("Totul la zi"), not
 * "0 plăți în așteptare".
 */
export type PluralForm = "zero" | "one" | "few" | "other";

export function pluralForm(count: number, locale: "ro" | "en"): PluralForm {
  if (count === 0) return "zero";
  const form = new Intl.PluralRules(locale === "ro" ? "ro-RO" : "en-US").select(count);
  // Romanian and English only ever produce these three; anything else would be
  // a language this panel does not speak, and "other" is the safe reading.
  return form === "one" || form === "few" ? form : "other";
}

/**
 * The sentence for a count: the message under `${base}.${form}` with its
 * `{count}` filled in. `t` is the admin panel's translator.
 */
export function countSentence(
  t: (key: string) => string,
  locale: "ro" | "en",
  base: string,
  count: number
): string {
  return t(`${base}.${pluralForm(count, locale)}`).replace("{count}", String(count));
}
