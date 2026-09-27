import { createAdminClient } from "@/lib/supabase/admin";
import { eventEmailVars, fillEmailTemplate, loadTemplate, sendEmail, type EmailLocale } from "@/lib/email";

/**
 * Tells someone she has taken them off an event: "your booking was
 * cancelled" for a booking, "you are no longer on the waiting list" for a
 * waiting-list entry. Sent only when she ticks the box in the removal dialog,
 * in the language they booked in. Her reason is not in it.
 *
 * Returns whether the email went; a failure is logged, never thrown, because
 * the removal itself has already happened.
 */
export async function sendRemovalEmail({
  kind,
  eventId,
  fullName,
  email,
  locale,
}: {
  kind: "booking" | "waitlist";
  eventId: string;
  fullName: string;
  email: string;
  locale: EmailLocale;
}): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data: event, error } = await supabase
      .from("events")
      .select("title_ro, title_en, date, time, end_date, end_time, location")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw error;
    if (!event) return false;

    const type = kind === "booking" ? "booking_cancelled" : "waitlist_removed";
    const template = await loadTemplate(supabase, type, locale);
    if (!template) {
      console.error(`No '${type}' email template; the removal email was not sent.`);
      return false;
    }

    const vars = { user_name: fullName, ...eventEmailVars(event, locale) };
    const result = await sendEmail({
      to: email,
      subject: fillEmailTemplate(template.subject, vars),
      html: fillEmailTemplate(template.body, vars),
    });
    if (!result.ok) console.error("Removal email failed:", result.error);
    return result.ok;
  } catch (error) {
    console.error("Removal email failed:", error);
    return false;
  }
}
