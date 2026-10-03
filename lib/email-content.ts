import { EVENT_TIME_ZONE, formatDate, formatEventSchedule } from "@/lib/utils";
import { refundDeadline } from "@/lib/cancel-rules";

/**
 * What the site's emails say: which automatic emails exist and when each is
 * sent, the placeholders each may use, and filling them in.
 *
 * Plain data and string functions with nothing server-only in them, so the
 * admin's live preview (in the browser) and the server that sends the email
 * fill a template with the same code. A preview that ran different code would
 * be a guess about the email rather than the email.
 */

export type EmailLocale = "ro" | "en";
export type Bilingual = { ro: string; en: string };

/** The page's language from a stored value: English when it says so, else Romanian. */
export function emailLocale(value: unknown): EmailLocale {
  return value === "en" ? "en" : "ro";
}

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

interface VariableDef {
  /** The chip's name in the editor. */
  label: Bilingual;
  /**
   * For an address: the words a link to it starts with when she inserts it.
   * A link alone on its line is drawn as a button (lib/email-layout.ts).
   */
  link?: Bilingual;
}

/**
 * Every placeholder any email can use, written {{name}} in a stored template.
 * Which ones a given email can use is in TEMPLATES below; a placeholder an
 * email does not know becomes nothing.
 */
export const VARIABLES = {
  user_name: { label: { ro: "Nume", en: "Name" } },
  event_name: { label: { ro: "Eveniment", en: "Event" } },
  event_date: { label: { ro: "Data", en: "Date" } },
  event_time: { label: { ro: "Ora", en: "Time" } },
  event_location: { label: { ro: "Locul", en: "Place" } },
  event_end: { label: { ro: "Data de final", en: "End date" } },
  expires_at: { label: { ro: "Valabil până la", en: "Valid until" } },
  event_link: {
    label: { ro: "Pagina evenimentului", en: "Event page" },
    link: { ro: "Vezi detalii", en: "See the details" },
  },
  whatsapp_link: {
    label: { ro: "Grupul de WhatsApp", en: "WhatsApp group" },
    link: { ro: "Intră în grupul de WhatsApp", en: "Join the WhatsApp group" },
  },
  claim_url: {
    label: { ro: "Link de rezervare", en: "Booking link" },
    link: { ro: "Rezervă-ți locul", en: "Claim your spot" },
  },
  testimonial_link: {
    label: { ro: "Link pentru testimonial", en: "Testimonial link" },
    link: { ro: "Scrie un testimonial", en: "Write a testimonial" },
  },
  cancel_link: {
    label: { ro: "Link de anulare", en: "Cancellation link" },
    link: { ro: "Anulează înscrierea", en: "Cancel your booking" },
  },
  refund_until: { label: { ro: "Rambursare automată până la", en: "Automatic refund until" } },
} as const satisfies Record<string, VariableDef>;

export type VariableName = keyof typeof VARIABLES;

export function isVariableName(name: string): name is VariableName {
  return Object.prototype.hasOwnProperty.call(VARIABLES, name);
}

/** Whether a placeholder stands for an address, which the editor inserts as a link. */
export function isLinkVariable(name: string): boolean {
  return isVariableName(name) && "link" in VARIABLES[name];
}

// ---------------------------------------------------------------------------
// The automatic emails
// ---------------------------------------------------------------------------

/** One row per email in `email_templates` (its CHECK constraint lists the same). */
export const TEMPLATE_TYPES = [
  "registration_confirmation",
  "payment_confirmation",
  "waitlist_joined",
  "spot_available",
  "waitlist_removed",
  "booking_cancelled",
  "testimonial_request",
  "review_too_early",
] as const;

export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export function isTemplateType(value: string): value is TemplateType {
  return (TEMPLATE_TYPES as readonly string[]).includes(value);
}

interface TemplateDef {
  label: Bilingual;
  /** When the site sends it, as she would say it. */
  when: Bilingual;
  variables: readonly VariableName[];
  /** {{user_name}} is the first name only (the testimonial emails); elsewhere the name as typed. */
  firstName?: boolean;
  /** How long its link lasts, for the preview's {{expires_at}}. */
  expiresInHours?: number;
}

const EVENT_VARS = ["user_name", "event_name", "event_date", "event_time", "event_location", "event_link"] as const;

export const TEMPLATES: Record<TemplateType, TemplateDef> = {
  registration_confirmation: {
    label: { ro: "Confirmare înscriere", en: "Booking confirmation" },
    when: {
      ro: "Imediat ce cineva se înscrie la un eveniment gratuit, sau își ia un loc eliberat la unul, și când trimiți confirmarea cuiva căruia i-ai dat un loc. Are atașată invitația pentru calendar și linkul personal de anulare.",
      en: "As soon as someone books a free event, or takes a freed seat on one, and when you send it to someone you gave a place to. The calendar invitation and their personal cancellation link come with it.",
    },
    variables: [...EVENT_VARS, "whatsapp_link", "cancel_link"],
  },
  payment_confirmation: {
    label: { ro: "Confirmare plată", en: "Payment confirmation" },
    when: {
      ro: "Imediat ce ajunge plata pentru un eveniment cu plată. Are atașată invitația pentru calendar și linkul personal de anulare.",
      en: "As soon as the payment for a paid event comes through. The calendar invitation and their personal cancellation link come with it.",
    },
    variables: [...EVENT_VARS, "whatsapp_link", "cancel_link", "refund_until"],
  },
  waitlist_joined: {
    label: { ro: "Pe lista de așteptare", en: "On the waiting list" },
    when: {
      ro: "Când cineva intră pe lista de așteptare a unui eveniment complet.",
      en: "When someone joins a full event’s waiting list.",
    },
    variables: EVENT_VARS,
  },
  spot_available: {
    label: { ro: "Loc eliberat", en: "A place freed up" },
    when: {
      ro: "Când se eliberează un loc: primii de pe lista de așteptare primesc un link de rezervare valabil 24 de ore.",
      en: "When a place frees up: the first people on the waiting list get a booking link that works for 24 hours.",
    },
    variables: [...EVENT_VARS, "claim_url", "expires_at"],
    expiresInHours: 24,
  },
  waitlist_removed: {
    label: { ro: "Scos de pe lista de așteptare", en: "Removed from the waiting list" },
    when: {
      ro: "Doar când scoți pe cineva de pe lista de așteptare și bifezi să primească un email.",
      en: "Only when you take someone off the waiting list and tick that they should be emailed.",
    },
    variables: EVENT_VARS,
  },
  booking_cancelled: {
    label: { ro: "Înscriere anulată", en: "Booking cancelled" },
    when: {
      ro: "Doar când anulezi o înscriere și bifezi să primească un email.",
      en: "Only when you cancel a booking and tick that they should be emailed.",
    },
    variables: EVENT_VARS,
  },
  testimonial_request: {
    label: { ro: "Invitație la testimonial", en: "Testimonial invitation" },
    when: {
      ro: "În dimineața de după eveniment, dacă invitațiile sunt pornite; când apeși „Trimite invitațiile” la un eveniment încheiat; sau când cineva își cere linkul pe site.",
      en: "The morning after the event, if invitations are on; when you press “Send invitations” on an ended event; or when someone asks for their link on the site.",
    },
    variables: [...EVENT_VARS, "testimonial_link", "expires_at"],
    firstName: true,
    expiresInHours: 60 * 24,
  },
  review_too_early: {
    label: { ro: "Testimonial: prea devreme", en: "Testimonial: too early" },
    when: {
      ro: "Când cineva își cere linkul pentru testimonial înainte să se încheie evenimentul.",
      en: "When someone asks for a testimonial link before the event has ended.",
    },
    variables: [...EVENT_VARS, "event_end"],
    firstName: true,
  },
};

/** The automatic emails in the order a booking lives through them. */
export const TEMPLATE_GROUPS: readonly { id: string; title: Bilingual; types: readonly TemplateType[] }[] = [
  {
    id: "booking",
    title: { ro: "Înscrierea", en: "Booking" },
    types: ["registration_confirmation", "payment_confirmation"],
  },
  {
    id: "waiting",
    title: { ro: "Lista de așteptare", en: "The waiting list" },
    types: ["waitlist_joined", "spot_available", "waitlist_removed"],
  },
  {
    id: "cancelling",
    title: { ro: "Anularea", en: "Cancelling" },
    types: ["booking_cancelled"],
  },
  {
    id: "after",
    title: { ro: "După eveniment", en: "After the event" },
    types: ["testimonial_request", "review_too_early"],
  },
];

/** What an announcement may use: the name, and events inserted as cards. */
export const ANNOUNCEMENT_VARIABLES: readonly VariableName[] = ["user_name"];

// ---------------------------------------------------------------------------
// Filling a template in
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Escapes text before it is dropped into an HTML email.
 *
 * One of the values is the name typed into a public form. Unescaped, someone
 * could book as `<a href="http://evil.example">Click here</a>` and that link
 * would arrive as a real one in an email from her own address: a ready-made
 * phishing email with her branding on it.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A subject line: placeholders become their values as plain text. Not
 * HTML-escaped, because a subject is a header rather than HTML: an event
 * called "Yoga & brunch" used to arrive as "Yoga &amp; brunch". Line breaks
 * are taken out, since a header cannot hold one.
 */
export function fillText(template: string, vars: Record<string, string>): string {
  return template
    .replace(PLACEHOLDER, (_match, key: string) => vars[key] ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function isEmptyValue(vars: Record<string, string>, key: string): boolean {
  return !(vars[key] ?? "").trim();
}

/**
 * A line of a template with its empty parts taken out, or null to leave the
 * whole line out.
 *
 *   - A link whose address is an empty placeholder has nowhere to go: alone
 *     on its line (a button), the line goes; beside other words, the words
 *     stay without the link.
 *   - A labelled line whose value is empty goes: "Ora: {{event_time}}" for an
 *     event with no hour yet would otherwise print "Ora:" and nothing.
 */
function tidyLine(line: string, vars: Record<string, string>): string | null {
  const unlinked = line.replace(
    /<a\b[^>]*href="\{\{\s*(\w+)\s*\}\}"[^>]*>([\s\S]*?)<\/a>/gi,
    (match, key: string, inner: string) => (isEmptyValue(vars, key) ? `\u0000${inner}\u0000` : match)
  );
  if (unlinked !== line) {
    const outside = unlinked.replace(/\u0000[\s\S]*?\u0000/g, "");
    if (!textOf(outside.replace(PLACEHOLDER, ""))) return null;
    line = unlinked.replace(/\u0000/g, "");
  }

  const keys = [...line.matchAll(PLACEHOLDER)].map((m) => m[1]);
  if (keys.length > 0 && keys.every((key) => isEmptyValue(vars, key))) {
    const rest = textOf(line.replace(PLACEHOLDER, ""));
    if (!rest || rest.endsWith(":")) return null;
  }
  return line;
}

/** A paragraph or list item, line by line (lines are split at <br>). */
function tidyBlock(inner: string, vars: Record<string, string>): string | null {
  const lines = inner.split(/<br\s*\/?>/i);
  const kept = lines.map((line) => tidyLine(line, vars)).filter((line): line is string => line !== null);
  if (kept.length === 0) return null;
  return kept.join("<br>");
}

/**
 * A stored template's HTML with its placeholders filled in, every value
 * escaped on the way in. Every email goes through this one function, so the
 * escaping cannot be forgotten by one of them. Lines left with nothing to say
 * are left out (tidyLine).
 */
export function fillHtml(template: string, vars: Record<string, string>): string {
  const tidied = template
    .replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (_match, attrs: string, inner: string) => {
      const kept = tidyBlock(inner, vars);
      return kept === null ? "" : `<p${attrs}>${kept}</p>`;
    })
    // A list item whose only paragraph went, then a list with no items left.
    .replace(/<li\b[^>]*>\s*<\/li>/gi, "")
    .replace(/<(ul|ol)\b[^>]*>\s*<\/\1>/gi, "");

  return tidied.replace(PLACEHOLDER, (_match, key: string) => escapeHtml(vars[key] ?? ""));
}

// ---------------------------------------------------------------------------
// The values
// ---------------------------------------------------------------------------

/** The event columns an email about it needs. */
export interface EmailEvent {
  slug?: string | null;
  title_ro: string;
  title_en: string | null;
  date: string;
  time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  whatsapp_group_link?: string | null;
  /** When it starts, for {{refund_until}}. */
  starts_at?: string | null;
}

/** The event's title in the person's language, the Romanian when the English is blank. */
export function eventTitle(event: Pick<EmailEvent, "title_ro" | "title_en">, locale: EmailLocale): string {
  return (locale === "en" && event.title_en?.trim()) || event.title_ro;
}

/** The event's page on the site, in their language. */
export function eventPageUrl(siteUrl: string, slug: string, locale: EmailLocale): string {
  return `${siteUrl}/${locale}/events/${encodeURIComponent(slug)}`;
}

/**
 * The placeholders every email about an event can use, in the person's
 * language. {{event_date}} is the date as the site writes it ("10 octombrie
 * 2026", "October 10, 2026", or a range for an event over several days) and
 * {{event_time}} the hours, with the end when she has given one (audit B15).
 * {{event_link}} needs the site's address, and is left empty without it.
 */
export function eventEmailVars(event: EmailEvent, locale: EmailLocale, siteUrl?: string): Record<string, string> {
  const schedule = formatEventSchedule(event, locale);
  return {
    event_name: eventTitle(event, locale),
    event_date: schedule.date,
    event_time: schedule.time ?? "",
    event_location: event.location || "",
    event_link: siteUrl && event.slug ? eventPageUrl(siteUrl, event.slug, locale) : "",
    whatsapp_link: event.whatsapp_group_link || "",
  };
}

/** A moment as an email writes it: "25 noiembrie 2026, 18:00", Romanian time. */
export function emailMoment(date: Date, locale: EmailLocale): string {
  return date.toLocaleString(locale === "en" ? "en-GB" : "ro-RO", {
    timeZone: EVENT_TIME_ZONE,
    dateStyle: "long",
    timeStyle: "short",
  });
}

/** "Ana Maria Popescu" to "Ana". */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** The sample person a preview and a test email are addressed to. */
const SAMPLE_NAME = "Ana Popescu";

/**
 * The values a preview and a test email fill a template with: those of a real
 * event (the next one, normally), so she sees her own dates and places, and
 * links that lead to its page. Without any event, each placeholder shows its
 * own name in brackets.
 */
export function sampleVars(
  type: TemplateType | "announcement",
  locale: EmailLocale,
  event: EmailEvent | null,
  siteUrl: string,
  now: Date = new Date()
): Record<string, string> {
  const def = type === "announcement" ? null : TEMPLATES[type];
  const vars: Record<string, string> = {
    user_name: def?.firstName ? firstName(SAMPLE_NAME) : SAMPLE_NAME,
  };
  if (event) {
    Object.assign(vars, eventEmailVars(event, locale, siteUrl));
    vars.event_end = formatDate(event.end_date || event.date, locale);
  } else {
    for (const key of ["event_name", "event_date", "event_time", "event_location", "event_end"] as const) {
      vars[key] = `[${VARIABLES[key].label[locale]}]`;
    }
    vars.event_link = `${siteUrl}/${locale}/events`;
  }
  const page = vars.event_link || `${siteUrl}/${locale}/events`;
  vars.claim_url = page;
  vars.testimonial_link = `${siteUrl}/${locale}/testimonials`;
  // A sample's link opens the cancel page with no booking behind it, which
  // says so: nothing in a preview can cancel anything.
  vars.cancel_link = `${siteUrl}/${locale}/booking`;
  if (type === "payment_confirmation") {
    // As the real email does: empty, and the line left out, once the moment
    // has passed.
    const deadline = event?.starts_at ? refundDeadline(event.starts_at) : null;
    vars.refund_until = !event
      ? `[${VARIABLES.refund_until.label[locale]}]`
      : deadline && deadline.getTime() > now.getTime()
        ? emailMoment(deadline, locale)
        : "";
  }
  if (def?.expiresInHours) {
    vars.expires_at = emailMoment(new Date(now.getTime() + def.expiresInHours * 3_600_000), locale);
  }
  return vars;
}
