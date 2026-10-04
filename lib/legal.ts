import type { SiteContent } from "@/lib/site-content";

/**
 * The business facts a legal document can mention, written in it as
 * {{token}} ("Operatorul datelor este {{business_name}}") and filled in here
 * from "Conținut site" → "Pagini legale".
 *
 * A fact she has not supplied becomes a dashed marker named after it, the
 * same treatment as every other missing piece of content, so a page that is
 * not finished says so instead of printing "{{address}}" or, worse, a guess.
 */
const TOKENS: Record<string, { ro: string; en: string }> = {
  business_name: { ro: "Denumirea firmei", en: "Business name" },
  registration: { ro: "CUI", en: "Registration number" },
  address: { ro: "Sediul", en: "Registered address" },
  email: { ro: "Email pentru date personale", en: "Privacy email" },
  vat: { ro: "Statutul TVA", en: "VAT status" },
  site_name: { ro: "Numele site-ului", en: "Site name" },
  site_url: { ro: "Adresa site-ului", en: "Site address" },
};

const VAT_SENTENCE: Record<string, { ro: string; en: string }> = {
  payer: { ro: "Prețurile includ TVA", en: "Prices include VAT" },
  non_payer: {
    ro: "Organizatorul nu este plătitor de TVA, deci prețurile nu conțin TVA",
    en: "The organiser is not registered for VAT, so prices do not include VAT",
  },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PLACEHOLDER_CLASS =
  "inline-block rounded-md border border-dashed border-sage/60 bg-sage/5 px-1.5 text-charcoal-light";

/**
 * Replaces every {{token}} in her document with its value, or with a dashed
 * marker. The values are escaped: they are plain text she typed, and a
 * company name with an ampersand must not turn into markup. Unknown tokens
 * are left as she wrote them, so a typo is visible rather than silently lost.
 *
 * Returns HTML that still goes through sanitizeHtml before it is rendered.
 */
export function fillLegalTokens(
  html: string,
  content: SiteContent,
  locale: string,
  facts: { siteName: string; siteUrl: string }
): string {
  const lang = locale === "en" ? "en" : "ro";
  const values: Record<string, string | undefined> = {
    business_name: content["legal.business_name"],
    registration: content["legal.registration"],
    address: content["legal.address"],
    email: content["legal.email"],
    vat: content["legal.vat"] ? VAT_SENTENCE[content["legal.vat"]]?.[lang] : undefined,
    site_name: facts.siteName,
    site_url: facts.siteUrl,
  };
  return html.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, token: string) => {
    if (!(token in TOKENS)) return match;
    const value = values[token]?.trim();
    if (value) return escapeHtml(value).replace(/\n/g, "<br>");
    return `<span class="${PLACEHOLDER_CLASS}" data-placeholder="true">${escapeHtml(TOKENS[token][lang])}</span>`;
  });
}
