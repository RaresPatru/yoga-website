import { createAdminClient } from "@/lib/supabase/admin";
import { generateICS } from "@/lib/calendar";
import { absoluteUrl, siteUrl } from "@/lib/site-config";
import { toPlainParagraphs } from "@/lib/plain-text";
import { emailMoment, eventEmailVars, eventTitle, type EmailLocale } from "@/lib/email-content";
import { sendTemplateEmail } from "@/lib/email";
import { hashToken, newToken } from "@/lib/tokens";
import { refundDeadline } from "@/lib/cancel-rules";

interface SendConfirmationArgs {
  /** The booking: its cancel link is made for it. */
  registrationId: string;
  eventId: string;
  fullName: string;
  email: string;
  /** The language they booked in: the email, its dates and the calendar entry follow it. */
  locale: EmailLocale;
  /**
   * Which stored template to use. 'registration_confirmation' for free events,
   * 'payment_confirmation' once Stripe reports a successful payment.
   */
  templateType: "registration_confirmation" | "payment_confirmation";
}

/**
 * Sends the "you're booked" email with a calendar invite attached, in the
 * language the person booked in.
 *
 * Lives in its own module because these places send it and they must behave
 * identically:
 *
 *   - /api/register                 a FREE event, booked
 *   - /api/register/claim-spot      a FREE event, claimed from the waiting list
 *   - lib/payments.ts               a PAID event, once the payment succeeds
 *   - the participant panel         to the person she moved a booking to
 *
 * That split matters. This email carries the WhatsApp group link and the
 * calendar invite, so it must not go out before money has changed hands.
 *
 * It also carries their cancel link ({{cancel_link}}): a new token each time,
 * whose hash replaces the booking's last one, so only the newest email's link
 * works. A paid booking's email says until when cancelling refunds the money
 * automatically ({{refund_until}}); that line is left out when the moment has
 * already passed.
 *
 * A failure is logged and reported as `false`, never thrown: a booking that
 * succeeded should not be reported as failed because the mail provider had a
 * bad minute. The row is in the database and she can see it in the admin.
 */
export async function sendConfirmationEmail({
  registrationId,
  eventId,
  fullName,
  email,
  locale,
  templateType,
}: SendConfirmationArgs): Promise<boolean> {
  try {
    const supabase = createAdminClient();

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select(
        "id, slug, title_ro, title_en, description_ro, description_en, date, time, end_date, end_time, location, whatsapp_group_link, starts_at"
      )
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) return false;

    const title = eventTitle(event, locale);
    const description = (locale === "en" && event.description_en?.trim()) || event.description_ro;

    const icsContent = generateICS({
      title,
      description: toPlainParagraphs(description),
      date: event.date,
      time: event.time,
      location: event.location || "",
      // The database id keeps the calendar entry stable, so the payment
      // confirmation updates the entry the registration confirmation created
      // rather than adding a second copy, and so does the one from the
      // event page (/api/calendar/event/[slug]). Anything this entry says
      // that that one does not is a disagreement between two entries claiming
      // to be the same entry, so the two are built from the same fields.
      uid: event.id,
      endDate: event.end_date,
      endTime: event.end_time,
      url: absoluteUrl(`/${locale}/events/${encodeURIComponent(event.slug)}`),
    });

    // Without a stored token the link would lead nowhere, so the email goes
    // without it (the line keeps its words, without the link) rather than not
    // at all.
    const token = newToken();
    const { error: tokenError } = await supabase
      .from("registrations")
      .update({ cancel_token_hash: hashToken(token) })
      .eq("id", registrationId);
    if (tokenError) console.error("Could not store the cancel link:", tokenError);
    const cancelLink = tokenError ? "" : absoluteUrl(`/${locale}/booking?token=${token}`);

    const deadline = refundDeadline(event.starts_at);
    const refundUntil =
      templateType === "payment_confirmation" && deadline.getTime() > Date.now() ? emailMoment(deadline, locale) : "";

    // Strip characters that are awkward in a filename across operating systems.
    const safeName = title.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60);

    const result = await sendTemplateEmail({
      type: templateType,
      locale,
      to: email,
      vars: {
        user_name: fullName,
        ...eventEmailVars(event, locale, siteUrl()),
        cancel_link: cancelLink,
        refund_until: refundUntil,
      },
      attachments: [
        {
          filename: `${safeName || (locale === "en" ? "event" : "eveniment")}.ics`,
          content: Buffer.from(icsContent).toString("base64"),
          contentType: "text/calendar; charset=utf-8",
        },
      ],
    });
    if (!result.ok) {
      console.error(`Confirmation email (${templateType}) failed:`, result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Confirmation email (${templateType}) failed:`, error);
    return false;
  }
}
