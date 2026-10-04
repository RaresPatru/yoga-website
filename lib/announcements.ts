import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-config";
import { emailLocale, fillHtml, fillText, type EmailLocale } from "@/lib/email-content";
import { renderEmail } from "@/lib/email-layout";
import { loadEmailSettings } from "@/lib/email-brand";
import { cardEventsFor, eventCardIds, loadCardEvents } from "@/lib/email-preview";
import { exclusions, parseAudience, resolveAudience } from "@/lib/announcement-audience";
import { sendEmails, senderOf, type OutgoingEmail } from "@/lib/email";
import { hashToken, newToken, plausibleToken } from "@/lib/tokens";

/**
 * Sending an announcement, and unsubscribing from them. Server only: it uses
 * the service key, and the rule about who may receive one has to hold where
 * the email leaves.
 *
 * HOW A SEND GOES
 *
 * 1. The announcement is claimed: its status moves to `sending` in one
 *    conditional update, so two presses of Send (or two tabs) cannot both
 *    send it. A send that died halfway (the function timed out) can be taken
 *    over ten minutes after it last moved.
 * 2. The first time, its recipients are worked out (lib/announcement-
 *    audience.ts) and written down: `pending` for those it will go to,
 *    `excluded` with the reason for the rest.
 * 3. A hundred at a time: the rule is checked once more, each person gets
 *    their own unsubscribe link (a random token, stored as its hash), the
 *    emails go in one request, and each is marked sent or failed.
 * 4. It is marked sent. Failed ones can be tried again later, which runs the
 *    same steps for them alone.
 */

/** A send that has not moved for this long is taken to have died. */
const STALE_MS = 10 * 60 * 1000;
const BATCH = 100;

export type SendRefusal = "not_found" | "busy" | "already_sent" | "empty" | "nobody";

export interface SendReport {
  sent: number;
  failed: number;
  excluded: number;
}

function hasWords(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim() !== "" || /data-event-card=/.test(html);
}

/** Their own unsubscribe links: the page with a button, and the one mail apps press for them. */
function unsubscribeLinks(base: string, locale: EmailLocale, token: string) {
  return {
    page: `${base}/${locale}/unsubscribe?token=${token}`,
    oneClick: `${base}/api/unsubscribe?token=${token}`,
  };
}

export async function sendAnnouncement(
  id: string,
  { retry = false }: { retry?: boolean } = {}
): Promise<{ ok: true; report: SendReport } | { ok: false; refused: SendRefusal }> {
  const service = createAdminClient();
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const now = () => new Date().toISOString();

  // 1. Claim it. A retry starts from a sent announcement; a send from a draft.
  const { data: claimed, error: claimError } = await service
    .from("announcements")
    .update({ status: "sending", send_started_at: now() })
    .eq("id", id)
    .or(`status.eq.${retry ? "sent" : "draft"},and(status.eq.sending,send_started_at.lt."${staleBefore}")`)
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    const { data: current, error } = await service.from("announcements").select("status").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!current) return { ok: false, refused: "not_found" };
    return { ok: false, refused: current.status === "sent" ? "already_sent" : "busy" };
  }
  const release = (status: "draft" | "sent") =>
    service.from("announcements").update({ status, send_started_at: null }).eq("id", id);

  if (!claimed.subject_ro.trim() || !hasWords(claimed.body_ro)) {
    await release(retry ? "sent" : "draft");
    return { ok: false, refused: "empty" };
  }

  // 2. Its recipients, written down the first time.
  const { count, error: countError } = await service
    .from("announcement_recipients")
    .select("email", { count: "exact", head: true })
    .eq("announcement_id", id);
  if (countError) throw countError;
  if (!count) {
    const people = await resolveAudience(service, parseAudience(claimed.audience));
    if (!people.some((person) => person.included)) {
      await release("draft");
      return { ok: false, refused: "nobody" };
    }
    for (let i = 0; i < people.length; i += 500) {
      const { error } = await service.from("announcement_recipients").insert(
        people.slice(i, i + 500).map((person) => ({
          announcement_id: id,
          email: person.email,
          full_name: person.fullName,
          locale: person.locale,
          status: person.included ? "pending" : "excluded",
          reason: person.reason,
        }))
      );
      if (error) throw error;
    }
  }
  if (retry) {
    const { error } = await service
      .from("announcement_recipients")
      .update({ status: "pending", reason: null })
      .eq("announcement_id", id)
      .eq("status", "failed");
    if (error) throw error;
  }

  // What each language says, and the cards in it.
  const settings = await loadEmailSettings(service, siteUrl());
  const base = settings.brand.siteUrl;
  const cardRows = await loadCardEvents(service, eventCardIds(claimed.body_ro, claimed.body_en));
  const content = (locale: EmailLocale) => ({
    subject: (locale === "en" && claimed.subject_en?.trim()) || claimed.subject_ro,
    body: (locale === "en" && claimed.body_en?.trim() && hasWords(claimed.body_en) && claimed.body_en) || claimed.body_ro,
    cards: cardEventsFor(cardRows, locale, base),
  });
  const byLocale = { ro: content("ro"), en: content("en") };
  const sender = senderOf(settings);

  // 3. A hundred at a time, until nobody is left pending.
  for (;;) {
    const { data: batch, error } = await service
      .from("announcement_recipients")
      .select("email, full_name, locale")
      .eq("announcement_id", id)
      .eq("status", "pending")
      .order("email")
      .limit(BATCH);
    if (error) throw error;
    if (!batch?.length) break;

    const verdicts = await exclusions(service, batch.map((person) => person.email));
    const leaving = batch.filter((person) => !verdicts.get(person.email));
    const leftOut = batch.filter((person) => verdicts.get(person.email));

    const tokens = new Map(leaving.map((person) => [person.email, newToken()]));
    const emails: OutgoingEmail[] = leaving.map((person) => {
      const locale = emailLocale(person.locale);
      const { subject, body, cards } = byLocale[locale];
      const vars = { user_name: person.full_name };
      const links = unsubscribeLinks(base, locale, tokens.get(person.email)!);
      const filledSubject = fillText(subject, vars);
      const { html, text } = renderEmail({
        brand: settings.brand,
        locale,
        subject: filledSubject,
        body: fillHtml(body, vars),
        events: cards,
        unsubscribeUrl: links.page,
      });
      return {
        to: person.email,
        subject: filledSubject,
        html,
        text,
        // One-click unsubscribe (RFC 8058): mail apps show their own
        // "Unsubscribe" and post to this address without opening a page.
        headers: {
          "List-Unsubscribe": `<${links.oneClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });

    // Their links work from the moment the email can arrive.
    if (leaving.length) {
      const { error: tokenError } = await service.from("announcement_recipients").upsert(
        leaving.map((person) => ({
          announcement_id: id,
          email: person.email,
          full_name: person.full_name,
          locale: person.locale,
          status: "pending",
          unsubscribe_token_hash: hashToken(tokens.get(person.email)!),
        })),
        { onConflict: "announcement_id,email" }
      );
      if (tokenError) throw tokenError;
    }

    const results = await sendEmails(emails, sender);
    const sentAt = now();
    const { error: markError } = await service.from("announcement_recipients").upsert(
      [
        ...leaving.map((person, i) => {
          const result = results[i];
          return {
            announcement_id: id,
            email: person.email,
            full_name: person.full_name,
            locale: person.locale,
            status: result.ok ? "sent" : "failed",
            reason: result.ok ? null : result.error.slice(0, 500),
            sent_at: result.ok ? sentAt : null,
            unsubscribe_token_hash: hashToken(tokens.get(person.email)!),
          };
        }),
        ...leftOut.map((person) => ({
          announcement_id: id,
          email: person.email,
          full_name: person.full_name,
          locale: person.locale,
          status: "excluded",
          reason: verdicts.get(person.email) ?? null,
          unsubscribe_token_hash: null,
        })),
      ],
      { onConflict: "announcement_id,email" }
    );
    if (markError) throw markError;

    // Still alive: nobody else may take the send over yet.
    await service.from("announcements").update({ send_started_at: now() }).eq("id", id);
  }

  // 4. Done.
  const { error: doneError } = await service
    .from("announcements")
    .update({ status: "sent", sent_at: claimed.sent_at ?? now(), send_started_at: null })
    .eq("id", id);
  if (doneError) throw doneError;

  const { data: totals, error: totalsError } = await service
    .from("announcement_recipients")
    .select("status")
    .eq("announcement_id", id);
  if (totalsError) throw totalsError;
  const report: SendReport = { sent: 0, failed: 0, excluded: 0 };
  for (const row of totals ?? []) {
    if (row.status === "sent") report.sent++;
    else if (row.status === "failed") report.failed++;
    else if (row.status === "excluded") report.excluded++;
  }
  return { ok: true, report };
}

/**
 * Someone pressed the unsubscribe link in an announcement: their address goes
 * on the suppression list, from now. Pressing it again moves the date
 * forward, which matters only if they had opted in again in between. False
 * for a token that matches nothing.
 */
export async function unsubscribe(token: string | null | undefined): Promise<boolean> {
  if (!plausibleToken(token)) return false;
  const service = createAdminClient();
  const { data: recipient, error } = await service
    .from("announcement_recipients")
    .select("announcement_id, email")
    .eq("unsubscribe_token_hash", hashToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!recipient) return false;

  const { error: suppressError } = await service.from("email_suppressions").upsert(
    {
      email: recipient.email,
      reason: "unsubscribed",
      announcement_id: recipient.announcement_id,
      created_at: new Date().toISOString(),
    },
    { onConflict: "email" }
  );
  if (suppressError) throw suppressError;
  return true;
}
