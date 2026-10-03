import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getResend } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-config";
import { fillHtml, fillText, type EmailLocale, type TemplateType } from "@/lib/email-content";
import { renderEmail } from "@/lib/email-layout";
import { loadEmailSettings, type EmailSettings } from "@/lib/email-brand";
import { usesLocalDatabase } from "@/lib/local-database";

/**
 * Sending the site's emails: where they go, who they are from, and what
 * happens when one fails. Server only.
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
 * WHO THEY ARE FROM
 *
 * The address is RESEND_FROM_EMAIL, which has to be on a domain verified in
 * Resend. The name beside it is her site's name ("flow4ward"), whatever name
 * the variable carries, and replies go to her own address (audit I13): the
 * sending address is usually one nobody reads.
 *
 * WHAT A FAILURE LOOKS LIKE
 *
 * Resend returns `{ error }` rather than throwing, and logs it only outside
 * production, so a send nobody checks fails in silence: a bad key or an
 * unverified domain meant nobody received anything and nobody found out
 * (audit B9). Every send here answers ok or the reason, and never throws: a
 * booking that worked is not undone by an email that did not go.
 */

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
  /** The plain-text version, for clients and readers that prefer it. */
  text: string;
  attachments?: EmailAttachment[];
  /** Extra headers, such as an announcement's List-Unsubscribe. */
  headers?: Record<string, string>;
}

export type SendResult = { ok: true } | { ok: false; error: string };

/** Who an email is from, and where a reply goes. */
export interface Sender {
  fromName: string;
  replyTo: string | null;
}

export function senderOf(settings: EmailSettings): Sender {
  return { fromName: settings.brand.siteName, replyTo: settings.replyTo };
}

/** Whether this run's emails go to the local mailbox rather than to Resend. */
export function usesLocalMailbox(): boolean {
  return usesLocalDatabase();
}

/** The local stack's mailbox (`[local_smtp]` in supabase/config.toml). */
function mailboxUrl(): string {
  return process.env.LOCAL_MAILBOX_URL || "http://127.0.0.1:54324";
}

/** The address out of "flow4ward <hello@example.ro>" or "hello@example.ro". */
function addressOf(from: string): string {
  return from.match(/<([^>]+)>/)?.[1]?.trim() ?? from.trim();
}

/**
 * A display name as a header needs it: quoted when it holds a character that
 * means something in an address, such as a comma or a full stop.
 */
function displayName(name: string): string {
  const clean = name.replace(/[\r\n]+/g, " ").trim();
  return /[()<>[\]:;@\\,."]/.test(clean) ? `"${clean.replace(/(["\\])/g, "\\$1")}"` : clean;
}

function fromHeader(sender: Sender, configured: string): string {
  const address = addressOf(configured);
  return sender.fromName ? `${displayName(sender.fromName)} <${address}>` : address;
}

async function sendToMailbox(email: OutgoingEmail, sender: Sender, configured: string): Promise<SendResult> {
  const response = await fetch(`${mailboxUrl()}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: { Email: addressOf(configured), Name: sender.fromName || undefined },
      To: [{ Email: email.to }],
      ReplyTo: sender.replyTo ? [{ Email: sender.replyTo }] : undefined,
      Subject: email.subject,
      HTML: email.html,
      Text: email.text,
      Headers: email.headers,
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

function resendPayload(email: OutgoingEmail, sender: Sender, configured: string) {
  return {
    from: fromHeader(sender, configured),
    to: email.to,
    replyTo: sender.replyTo ?? undefined,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: email.headers,
  };
}

export async function sendEmail(email: OutgoingEmail, sender: Sender): Promise<SendResult> {
  const configured = process.env.RESEND_FROM_EMAIL;
  try {
    if (usesLocalMailbox()) return await sendToMailbox(email, sender, configured || "site@localhost");
    if (!configured) return { ok: false, error: "RESEND_FROM_EMAIL is not set" };

    const { error } = await getResend().emails.send({
      ...resendPayload(email, sender, configured),
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

/** Resend's batch endpoint takes at most this many emails per request. */
const BATCH_SIZE = 100;

/**
 * Many emails at once, for announcements: one request per hundred to Resend,
 * each email's outcome reported by its position. Attachments are not
 * possible this way, and an announcement has none.
 */
export async function sendEmails(emails: OutgoingEmail[], sender: Sender): Promise<SendResult[]> {
  const configured = process.env.RESEND_FROM_EMAIL;
  if (usesLocalMailbox()) {
    const results: SendResult[] = [];
    for (const email of emails) {
      results.push(
        await sendToMailbox(email, sender, configured || "site@localhost").catch((error: unknown) => ({
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        }))
      );
    }
    return results;
  }
  if (!configured) return emails.map(() => ({ ok: false, error: "RESEND_FROM_EMAIL is not set" }));

  const results: SendResult[] = [];
  for (let start = 0; start < emails.length; start += BATCH_SIZE) {
    const chunk = emails.slice(start, start + BATCH_SIZE);
    try {
      // "permissive": an address Resend refuses fails on its own instead of
      // taking the other ninety-nine down with it.
      const { data, error } = await getResend().batch.send(
        chunk.map((email) => resendPayload(email, sender, configured)),
        { batchValidation: "permissive" }
      );
      if (error) {
        results.push(...chunk.map(() => ({ ok: false as const, error: `${error.name}: ${error.message}` })));
        continue;
      }
      const failed = new Map((data?.errors ?? []).map((e) => [e.index, e.message]));
      results.push(
        ...chunk.map((_email, i): SendResult => (failed.has(i) ? { ok: false, error: failed.get(i)! } : { ok: true }))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push(...chunk.map(() => ({ ok: false as const, error: message })));
    }
  }
  return results;
}

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

/**
 * One of the automatic emails, to one person: her template in their
 * language, filled in with `vars`, drawn in the site's layout and sent from
 * her name. Never throws; a missing template is a failure like any other.
 */
export async function sendTemplateEmail({
  type,
  locale,
  to,
  vars,
  attachments,
}: {
  type: TemplateType;
  locale: EmailLocale;
  to: string;
  vars: Record<string, string>;
  attachments?: EmailAttachment[];
}): Promise<SendResult> {
  try {
    const supabase = createAdminClient();
    const template = await loadTemplate(supabase, type, locale);
    if (!template) return { ok: false, error: `No '${type}' email template` };
    const settings = await loadEmailSettings(supabase, siteUrl());
    const subject = fillText(template.subject, vars);
    const { html, text } = renderEmail({
      brand: settings.brand,
      locale,
      subject,
      body: fillHtml(template.body, vars),
    });
    return await sendEmail({ to, subject, html, text, attachments }, senderOf(settings));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
