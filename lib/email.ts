import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getResend } from "@/lib/resend";
import { formatEventSchedule } from "@/lib/utils";

/**
 * Sending the site's emails: where they go, in which language, and what
 * happens when one fails.
 *
 * WHERE THEY GO
 *
 * To Resend, unless the site is running against the local database. Then the
 * bookings are test data, typed by whoever is trying the site on their own
 * machine or by the test suite, and their emails go to the local stack's
 * mailbox (Mailpit, http://127.0.0.1:54324) instead, where they can be read
 * and nobody real receives them. The address of the database is the thing
 * that decides, because it is what makes the data real or not: `npm run dev`
 * and the tests use the local one, `npm run dev:prod` and every deployment
 * use production (audit S6: local runs used to send through the live Resend
 * account).
 *
 * WHAT A FAILURE LOOKS LIKE
 *
 * Resend returns `{ error }` rather than throwing, and logs it only outside
 * production, so a send nobody checks fails in silence: a bad key or an
 * unverified domain meant nobody received anything and nobody found out
 * (audit B9). sendEmail() therefore answers every send with ok or the reason,
 * and never throws: a booking that worked is not undone by an email that did
 * not go.
 */

export type EmailLocale = "ro" | "en";

export interface EmailAttachment {
  filename: string;
  /** The file's bytes, base64-encoded. */
  content: string;
  contentType?: string;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export type SendResult = { ok: true } | { ok: false; error: string };

/** The page's language from a stored value: English when it says so, else Romanian. */
export function emailLocale(value: unknown): EmailLocale {
  return value === "en" ? "en" : "ro";
}

const LOCAL_DATABASE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;

/** Whether this run's emails go to the local mailbox rather than to Resend. */
export function usesLocalMailbox(): boolean {
  return LOCAL_DATABASE.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}

/** The local stack's mailbox (`[local_smtp]` in supabase/config.toml). */
function mailboxUrl(): string {
  return process.env.LOCAL_MAILBOX_URL || "http://127.0.0.1:54324";
}

/** "flow4ward <hello@example.ro>" or "hello@example.ro", as Mailpit wants it. */
function parseAddress(from: string): { Email: string; Name?: string } {
  const named = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return named ? { Email: named[2], Name: named[1] || undefined } : { Email: from.trim() };
}

async function sendToMailbox(email: OutgoingEmail, from: string): Promise<SendResult> {
  const response = await fetch(`${mailboxUrl()}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: parseAddress(from),
      To: [{ Email: email.to }],
      Subject: email.subject,
      HTML: email.html,
      Attachments: (email.attachments ?? []).map((a) => ({
        Filename: a.filename,
        Content: a.content,
        ContentType: a.contentType,
      })),
    }),
  });
  if (!response.ok) return { ok: false, error: `local mailbox answered ${response.status}` };
  return { ok: true };
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const from = process.env.RESEND_FROM_EMAIL;
  try {
    if (usesLocalMailbox()) return await sendToMailbox(email, from || "site@localhost");
    if (!from) return { ok: false, error: "RESEND_FROM_EMAIL is not set" };

    const { error } = await getResend().emails.send({
      from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      attachments: email.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    if (error) return { ok: false, error: `${error.name}: ${error.message}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Escapes text before it is dropped into an HTML email.
 *
 * One of the values is the name typed into a public form. Unescaped, someone
 * could book as `<a href="http://evil.example">Click here</a>` and that link
 * would arrive as a real one in an email from her own address: a ready-made
 * phishing email with her branding on it.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Substitutes {{key}} placeholders in a stored template, escaping every value
 * on the way in. Every email goes through this one function, so the escaping
 * cannot be forgotten by one of them.
 */
export function fillEmailTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => escapeHtml(vars[key] ?? ""));
}

/** The rows of `email_templates`, one per email the site sends (its CHECK constraint lists the same). */
export type TemplateType =
  | "registration_confirmation"
  | "payment_confirmation"
  | "testimonial_request"
  | "spot_available"
  | "booking_cancelled"
  | "waitlist_removed";

/**
 * A stored template in the person's language. An English subject or body left
 * blank falls back to the Romanian, as the site's pages do.
 */
export async function loadTemplate(
  supabase: SupabaseClient<Database>,
  type: TemplateType,
  locale: EmailLocale
): Promise<{ subject: string; body: string } | null> {
  const { data, error } = await supabase
    .from("email_templates")
    .select("subject_ro, subject_en, body_ro, body_en")
    .eq("type", type)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const en = locale === "en";
  return {
    subject: (en && data.subject_en?.trim()) || data.subject_ro,
    body: (en && data.body_en?.trim()) || data.body_ro,
  };
}

/** The event columns an email about it needs. */
export interface EmailEvent {
  title_ro: string;
  title_en: string | null;
  date: string;
  time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  whatsapp_group_link?: string | null;
}

/** The event's title in the person's language, the Romanian when the English is blank. */
export function eventTitle(event: Pick<EmailEvent, "title_ro" | "title_en">, locale: EmailLocale): string {
  return (locale === "en" && event.title_en?.trim()) || event.title_ro;
}

/**
 * The placeholders every email about an event can use, in the person's
 * language. {{event_date}} is the date as the site writes it ("10 octombrie
 * 2026", "October 10, 2026", or a range for an event over several days) and
 * {{event_time}} the hours, with the end when she has given one. Before, the
 * date arrived as "2026-10-10" and only in Romanian (audit B15).
 */
export function eventEmailVars(event: EmailEvent, locale: EmailLocale): Record<string, string> {
  const schedule = formatEventSchedule(event, locale);
  return {
    event_name: eventTitle(event, locale),
    event_date: schedule.date,
    event_time: schedule.time ?? "",
    event_location: event.location || "",
    whatsapp_link: event.whatsapp_group_link || "",
  };
}
