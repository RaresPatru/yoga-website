import { createAdminClient } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";
import { generateICS } from "@/lib/utils";

/**
 * Escapes text before it is dropped into an HTML email body.
 *
 * The email templates are stored in the database with {{placeholders}} that get
 * replaced with real values. One of those values is `user_name`, which is typed
 * by whoever fills in the registration form. Without escaping, someone could
 * register as `<a href="http://evil.example">Click here</a>` and that link would
 * render as a real link inside an email sent from the instructor's own domain —
 * a ready-made phishing email with her branding on it.
 *
 * Turning the five HTML-significant characters into entities makes the browser
 * (or mail client) display them as text instead of interpreting them as markup.
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
 * Substitutes {{key}} placeholders in a stored email template, escaping every
 * value on the way in.
 *
 * Exported because the waiting-list notification in the Stripe webhook fills
 * the same kind of template and must escape identically — a second, unescaped
 * copy of this logic is exactly how the injection hole would come back.
 */
export function fillEmailTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    escapeHtml(vars[key] ?? "")
  );
}

interface SendConfirmationArgs {
  eventId: string;
  fullName: string;
  email: string;
  /**
   * Which stored template to use. 'registration_confirmation' for free events,
   * 'payment_confirmation' once Stripe reports a successful payment.
   */
  templateType: "registration_confirmation" | "payment_confirmation";
}

/**
 * Sends the "you're booked" email with a calendar invite attached.
 *
 * Lives in its own module because two different places need it and they must
 * behave identically:
 *
 *   - /api/register        when someone signs up for a FREE event
 *   - the Stripe webhook   when payment for a PAID event actually succeeds
 *
 * That split matters. This email carries the WhatsApp group link and the
 * calendar invite, so it must not go out before money has changed hands.
 * Previously it was sent from /api/register for every registration, meaning
 * someone could start a paid booking, abandon the Stripe page, and still have
 * the group link sitting in their inbox.
 *
 * Failures are logged, not thrown: a booking that succeeded should not be
 * reported as failed just because the mail provider had a bad minute. The row
 * is already in the database and the instructor can see it in the admin panel.
 */
export async function sendConfirmationEmail({
  eventId,
  fullName,
  email,
  templateType,
}: SendConfirmationArgs): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { data: event } = await supabase
      .from("events")
      .select("id, title_ro, description_ro, date, time, location, whatsapp_group_link")
      .eq("id", eventId)
      .single();

    if (!event) return;

    const { data: template } = await supabase
      .from("email_templates")
      .select("subject_ro, body_ro")
      .eq("type", templateType)
      .single();

    if (!template) return;

    const vars: Record<string, string> = {
      user_name: fullName,
      event_name: event.title_ro,
      event_date: event.date,
      event_time: event.time.slice(0, 5),
      event_location: event.location || "",
      whatsapp_link: event.whatsapp_group_link || "",
    };

    const icsContent = generateICS({
      title: event.title_ro,
      description: event.description_ro || "",
      date: event.date,
      time: event.time,
      location: event.location || "",
      // The database id keeps the calendar entry stable, so the payment
      // confirmation updates the entry the registration confirmation created
      // rather than adding a second copy.
      uid: event.id,
    });

    // Strip characters that are awkward in a filename across operating systems.
    const safeName = event.title_ro.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60);

    await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: fillEmailTemplate(template.subject_ro, vars),
      html: fillEmailTemplate(template.body_ro, vars),
      attachments: [
        {
          filename: `${safeName || "eveniment"}.ics`,
          content: Buffer.from(icsContent).toString("base64"),
        },
      ],
    });
  } catch (error) {
    console.error(`Confirmation email (${templateType}) failed:`, error);
  }
}
