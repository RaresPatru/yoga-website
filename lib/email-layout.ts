import { BRAND } from "@/lib/brand-colors";
import { decodeEntities } from "@/lib/plain-text";
import { escapeHtml, type Bilingual, type EmailLocale } from "@/lib/email-content";

/**
 * The one layout every email from the site is drawn in: her name or logo at
 * the top, the message on a white sheet, her business name and address in
 * the footer, and for announcements the reason they are receiving it and a
 * way to unsubscribe. Every email also gets a plain-text version, made from
 * the same message.
 *
 * Email clients are not browsers. Outlook for Windows draws with Word's
 * engine, and Gmail keeps only part of a stylesheet, so this is written the
 * old way on purpose: tables for layout, styles on each element, colours as
 * hex, one column no wider than 560px.
 *
 * Two things in her text become more than text:
 *
 *   - A paragraph holding nothing but a link is drawn as a button, in the
 *     site's rose. Every link placeholder the editor inserts on its own line
 *     ("Rezervă-ți locul") becomes the email's one clear action this way.
 *   - An event card, which an announcement can hold, is drawn with the
 *     event's photo, title, date and place and a button to its page.
 *
 * Pure string work with no server imports: the admin's live preview draws the
 * same HTML in the browser that the server sends.
 */

export interface EmailBrand {
  /** Her site's name, as she set it. */
  siteName: string;
  /** Her logo, if she uploaded one an email can show (not an SVG). */
  logoUrl: string | null;
  /** What the site's top bar shows, and so what the email's top shows. */
  display: "name" | "logo" | "both";
  /** "Nume Prenume PFA", from Pagini legale, when she has filled it in. */
  businessName: string | null;
  /** Her registered address, from Pagini legale, when she has filled it in. */
  address: string | null;
  /** The site's address, with no trailing slash. */
  siteUrl: string;
}

/** An event as an announcement's card shows it, already in the reader's language. */
export interface EmailCardEvent {
  title: string;
  /** "10 octombrie 2026", or a range. */
  date: string;
  /** "18:30–20:00", when she has given an hour. */
  time: string | null;
  location: string | null;
  /** "150 RON", or the word for free. */
  price: string | null;
  imageUrl: string | null;
  /** Its page on the site. */
  url: string;
}

export interface EmailDocument {
  brand: EmailBrand;
  locale: EmailLocale;
  subject: string;
  /** Her message, already filled in (fillHtml). */
  body: string;
  /** For announcements: the reader's own unsubscribe link, and a footer that says why they get it. */
  unsubscribeUrl?: string;
  /** The events the message's cards refer to, by id. A card for an event not here is left out. */
  events?: Record<string, EmailCardEvent>;
}

const WORDS = {
  why: {
    ro: "Primești acest email pentru că ai ales să afli de evenimentele noi {site}.",
    en: "You are receiving this because you chose to hear about new events from {site}.",
  },
  unsubscribe: { ro: "Dezabonează-te", en: "Unsubscribe" },
  unsubscribeText: { ro: "Dezabonare", en: "Unsubscribe" },
  cardButton: { ro: "Vezi detalii și rezervă", en: "See details and book" },
} satisfies Record<string, Bilingual>;

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "'Playfair Display',Georgia,'Times New Roman',serif";

const TEXT = `margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:${BRAND.charcoal};`;
const STYLE = {
  p: TEXT,
  h2: `margin:0 0 16px;font-family:${SERIF};font-size:24px;line-height:1.3;font-weight:normal;color:${BRAND.charcoal};`,
  list: `margin:0 0 16px;padding:0 0 0 22px;font-family:${SANS};font-size:16px;line-height:1.6;color:${BRAND.charcoal};`,
  li: "margin:0 0 6px;",
  a: `color:${BRAND.roseDeep};text-decoration:underline;`,
} as const;

/** The border of the sheet and the card: the site's sage, lightened for white. */
const RULE = "#E4E9DD";

/** The address as the footer prints it: "flow4ward.ro". */
export function siteHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).host;
  } catch {
    return siteUrl.replace(/^https?:\/\//, "");
  }
}

/**
 * A link's address as an attribute value. A path on the site ("/ro/events")
 * becomes a full address, since an email has no page to resolve it against;
 * anything but http(s), mailto and tel becomes nothing.
 */
function safeHref(href: string, siteUrl: string): string {
  const decoded = decodeEntities(href.trim());
  if (decoded.startsWith("/") && !decoded.startsWith("//")) return escapeHtml(`${siteUrl}${decoded}`);
  return /^(https?:|mailto:|tel:)/i.test(decoded) ? escapeHtml(decoded) : "";
}

function button(href: string, label: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;border-collapse:separate;">` +
    `<tr><td style="border-radius:999px;background-color:${BRAND.roseDeep};">` +
    `<a href="${href}" style="display:inline-block;padding:13px 26px;border-radius:999px;font-family:${SANS};font-size:16px;font-weight:600;line-height:1.25;color:#FFFFFF;text-decoration:none;">${label}</a>` +
    `</td></tr></table>`
  );
}

function card(event: EmailCardEvent, locale: EmailLocale): string {
  const image = event.imageUrl
    ? `<tr><td style="padding:0;"><a href="${escapeHtml(event.url)}"><img src="${escapeHtml(event.imageUrl)}" width="496" alt="" style="display:block;width:100%;max-width:496px;height:auto;border:0;border-radius:14px 14px 0 0;"></a></td></tr>`
    : "";
  const when = [event.date, event.time].filter(Boolean).join(", ");
  const lines = [when, event.location, event.price]
    .filter((line): line is string => Boolean(line))
    .map(escapeHtml)
    .join("<br>");
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;border:1px solid ${RULE};border-radius:14px;border-collapse:separate;">` +
    image +
    `<tr><td style="padding:18px 20px 4px;">` +
    `<p style="margin:0 0 6px;font-family:${SERIF};font-size:20px;line-height:1.3;color:${BRAND.charcoal};">${escapeHtml(event.title)}</p>` +
    (lines ? `<p style="margin:0 0 12px;font-family:${SANS};font-size:15px;line-height:1.55;color:${BRAND.charcoalLight};">${lines}</p>` : "") +
    button(escapeHtml(event.url), escapeHtml(WORDS.cardButton[locale])) +
    `</td></tr></table>`
  );
}

const EVENT_CARD = /<div\b[^>]*data-event-card="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi;
/** A paragraph whose only content is one link. The link's words may not hold another link or paragraph. */
const LINK_ONLY_PARAGRAPH =
  /<p\b[^>]*>\s*<a\b[^>]*href="([^"]*)"[^>]*>((?:(?!<\/?a\b|<\/?p\b)[\s\S])*)<\/a>\s*<\/p>/gi;

/**
 * Her message with the email's style on every element, its buttons and its
 * cards. The buttons and cards are set aside while her elements are styled,
 * since they carry styles of their own.
 */
function styledBody(body: string, doc: EmailDocument): string {
  const kept: string[] = [];
  const keep = (html: string) => `\u0001${kept.push(html) - 1}\u0001`;
  const { siteUrl } = doc.brand;

  return body
    .replace(EVENT_CARD, (_match, id: string) => {
      const event = doc.events?.[id];
      return event ? keep(card(event, doc.locale)) : "";
    })
    .replace(LINK_ONLY_PARAGRAPH, (match, href: string, inner: string) => {
      const url = safeHref(href, siteUrl);
      const label = escapeHtml(decodeEntities(inner.replace(/<[^>]*>/g, "")).trim());
      return url && label ? keep(button(url, label)) : match;
    })
    // Every other element gets the email's style in place of any it had.
    .replace(/<(p|h2|ul|ol|li)\b([^>]*)>/gi, (_match, tag: string, attrs: string) => {
      const name = tag.toLowerCase();
      const style = name === "ul" || name === "ol" ? STYLE.list : STYLE[name as "p" | "h2" | "li"];
      return `<${name} style="${style}"${attrs.replace(/\s(style|class)="[^"]*"/gi, "")}>`;
    })
    .replace(/<a\b[^>]*?href="([^"]*)"[^>]*>/gi, (_match, href: string) => `<a href="${safeHref(href, siteUrl)}" style="${STYLE.a}">`)
    .replace(/\u0001(\d+)\u0001/g, (_match, index: string) => kept[Number(index)]);
}

// ---------------------------------------------------------------------------
// The plain-text version
// ---------------------------------------------------------------------------

function plainInline(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/[ \t]+/g, " ").trim();
}

/**
 * Her message as plain text, for the clients (and the readers) that prefer it:
 * a paragraph per block with a blank line between, list items with a dash,
 * a link as its words and its address, a card as its lines.
 */
export function htmlToText(
  body: string,
  { events = {}, locale = "ro", siteUrl = "" }: { events?: Record<string, EmailCardEvent>; locale?: EmailLocale; siteUrl?: string } = {}
): string {
  const address = (href: string) => decodeEntities(safeHref(href, siteUrl));
  const text = body
    // The editor wraps each list item's words in a paragraph; in text the dash is enough.
    .replace(/<li\b([^>]*)>\s*<p\b[^>]*>/gi, "<li$1>")
    .replace(/<\/p>\s*<\/li>/gi, "</li>")
    .replace(EVENT_CARD, (_match, id: string) => {
      const event = events[id];
      if (!event) return "";
      const when = [event.date, event.time].filter(Boolean).join(", ");
      const lines = [event.title, when, event.location, event.price, `${WORDS.cardButton[locale]}: ${event.url}`];
      return `\n\n${lines.filter(Boolean).join("\n")}\n\n`;
    })
    .replace(LINK_ONLY_PARAGRAPH, (_match, href: string, inner: string) => {
      const url = address(href);
      const label = plainInline(inner);
      if (!url) return `\n\n${label}\n\n`;
      return `\n\n${label && label !== url ? `${label}: ${url}` : url}\n\n`;
    })
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, inner: string) => {
      const url = address(href);
      const label = plainInline(inner);
      if (!url) return label;
      return !label || label === url ? url : `${label} (${url})`;
    })
    .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_match, inner: string) => {
      let n = 0;
      return `\n\n${inner.replace(/<li\b[^>]*>/gi, () => `\n${++n}. `)}\n\n`;
    })
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|ul|ol|div)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    // A list item's own paragraph would leave a blank line after the dash.
    .replace(/^(-|\d+\.) *\n+/gm, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// The whole email
// ---------------------------------------------------------------------------

function brandBlock(brand: EmailBrand): string {
  const name = escapeHtml(brand.siteName);
  const wordmark = `<a href="${escapeHtml(brand.siteUrl)}" style="font-family:${SERIF};font-size:26px;line-height:1.2;letter-spacing:0.01em;color:${BRAND.charcoal};text-decoration:none;">${name}</a>`;
  if (!brand.logoUrl || brand.display === "name") return wordmark;
  const logo = `<a href="${escapeHtml(brand.siteUrl)}"><img src="${escapeHtml(brand.logoUrl)}" width="180" alt="${name}" style="display:block;margin:0 auto;width:180px;max-width:100%;height:auto;border:0;"></a>`;
  return brand.display === "both" ? `${logo}<div style="height:10px;line-height:10px;">&nbsp;</div>${wordmark}` : logo;
}

function footerLines(doc: EmailDocument): { html: string; text: string } {
  const { brand, locale } = doc;
  const who = [brand.businessName || brand.siteName, ...(brand.address ? brand.address.split(/\r?\n/) : [])]
    .map((line) => line.trim())
    .filter(Boolean);
  const host = siteHost(brand.siteUrl);
  const why = doc.unsubscribeUrl ? WORDS.why[locale].replace("{site}", brand.siteName) : null;

  const muted = `color:${BRAND.charcoalLight};`;
  const html = [
    who.map(escapeHtml).join("<br>"),
    why
      ? `${escapeHtml(why)}<br><a href="${escapeHtml(doc.unsubscribeUrl!)}" style="${muted}text-decoration:underline;">${WORDS.unsubscribe[locale]}</a>`
      : null,
    `<a href="${escapeHtml(brand.siteUrl)}" style="${muted}text-decoration:underline;">${escapeHtml(host)}</a>`,
  ]
    .filter(Boolean)
    .join("<br><br>");

  const text = [
    who.join("\n"),
    why ? `${why}\n${WORDS.unsubscribeText[locale]}: ${doc.unsubscribeUrl}` : null,
    brand.siteUrl,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { html, text };
}

/**
 * The words the inbox shows beside the subject. Without it, most clients
 * show the first text in the email, which is her name from the top.
 */
function preheader(text: string): string {
  const first = text.replace(/\s+/g, " ").trim().slice(0, 140);
  // Spacers stop the inbox pulling the next words in after it.
  return escapeHtml(first) + "&#8199;&#847;".repeat(40);
}

export function renderEmail(doc: EmailDocument): { html: string; text: string } {
  const { brand, locale } = doc;
  const bodyText = htmlToText(doc.body, { events: doc.events, locale, siteUrl: brand.siteUrl });
  const footer = footerLines(doc);

  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(doc.subject)}</title>
<style>
  body { margin: 0; padding: 0; }
  @media (max-width: 600px) {
    .email-outer { padding: 20px 10px !important; }
    .email-sheet { padding: 28px 22px 16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader(bodyText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.cream};">
<tr><td align="center" class="email-outer" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td align="center" style="padding:0 0 20px;">${brandBlock(brand)}</td></tr>
<tr><td class="email-sheet" style="background-color:#FFFFFF;border:1px solid ${RULE};border-radius:18px;padding:36px 36px 20px;font-family:${SANS};font-size:16px;line-height:1.6;color:${BRAND.charcoal};">
${styledBody(doc.body, doc)}
</td></tr>
<tr><td align="center" style="padding:24px 16px 8px;font-family:${SANS};font-size:13px;line-height:1.6;color:${BRAND.charcoalLight};">${footer.html}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const text = `${brand.siteName}\n\n${bodyText}\n\n--\n${footer.text}\n`;
  return { html, text };
}
