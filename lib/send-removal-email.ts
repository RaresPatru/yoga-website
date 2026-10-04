import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-config";
import { eventEmailVars, type EmailLocale } from "@/lib/email-content";
import { sendTemplateEmail } from "@/lib/email";

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
    const { data: event, error } = await createAdminClient()
      .from("events")
      .select("slug, title_ro, title_en, date, time, end_date, end_time, location")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw error;
    if (!event) return false;

    const result = await sendTemplateEmail({
      type: kind === "booking" ? "booking_cancelled" : "waitlist_removed",
      locale,
      to: email,
      vars: { user_name: fullName, ...eventEmailVars(event, locale, siteUrl()) },
    });
    if (!result.ok) console.error("Removal email failed:", result.error);
    return result.ok;
  } catch (error) {
    console.error("Removal email failed:", error);
    return false;
  }
}
