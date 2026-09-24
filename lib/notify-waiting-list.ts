import { createAdminClient } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";
import { fillEmailTemplate } from "@/lib/send-confirmation-email";
import { absoluteUrl } from "@/lib/site-config";
import { EVENT_TIME_ZONE } from "@/lib/utils";

/** How long someone has to use a claim link before it stops working. */
export const CLAIM_WINDOW_HOURS = 24;

/**
 * Offers the free seats on an event to the people at the front of its waiting
 * list, oldest entry first.
 *
 * WHY THIS LIVES HERE RATHER THAN IN THE WEBHOOK
 *
 * It used to be a private function inside app/api/stripe/webhook/route.ts,
 * because a refund or an expired checkout was the only way a seat came back.
 * There is a second way now — she raises the capacity, or lowers it and leaves
 * room, in the admin panel — and two callers meant the rule about when it is
 * safe to email somebody had to stop being a rule one of them remembered.
 *
 * WHY IT COUNTS THE SEATS ITSELF
 *
 * The caller does not say how many people to notify, and cannot. Every caller
 * that tried got it wrong in the same direction: the webhook knew one seat had
 * been refunded and emailed one person, without ever asking whether the event
 * had a seat to give. For an event whose capacity is NULL or 0 — which now
 * means sold out, see 20260918000000_capacity_is_required.sql — the answer is
 * always no, so register_for_event() refused every one of those claims and the
 * link in the email was dead before it was sent.
 *
 * So the count is read here, from `event_availability`: the same view
 * register_for_event() is written to agree with, which is what makes a link
 * this function sends a link that route will honour. No free seats, no email.
 *
 * Returns how many people were emailed, which is 0 for most calls.
 */
export async function notifyWaitingList(eventId: string): Promise<number> {
  const supabase = createAdminClient();

  /*
   * `maybeSingle()`: the view only covers published events, so an unpublished
   * one has no row at all. That is the right answer for it too — an event
   * nobody can see is not an event anybody can claim a seat on.
   */
  const { data: availability } = await supabase
    .from("event_availability")
    .select("capacity, taken")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!availability) return 0;

  // NULL and 0 both mean sold out. Neither has a seat to offer, and `taken`
  // being 0 does not change that.
  const capacity = availability.capacity;
  if (capacity === null || capacity <= 0) return 0;

  const freeSeats = capacity - (availability.taken ?? 0);
  if (freeSeats <= 0) return 0;

  /*
   * A claim link that has not lapsed is a seat already promised.
   *
   * Without this the batch limit alone is not enough, because it is a limit per
   * call and the admin panel calls this after every save. Two seats, three
   * people waiting: the first save offers seats to the first two, and the
   * second save offers one to the third — nobody was written to twice, and yet
   * three people now hold live links to two seats. The third to act on theirs
   * gets the booking gate's refusal, which is the dead link this function
   * exists to prevent.
   *
   * Counting them against the free seats makes the invariant hold across calls
   * rather than within one: at no point do more live claim links exist than
   * there are seats to honour them.
   */
  const { count: outstanding } = await supabase
    .from("waiting_list")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .is("claimed_at", null)
    .gt("claim_expires_at", new Date().toISOString());

  const offerable = freeSeats - (outstanding ?? 0);
  if (offerable <= 0) return 0;

  const { data: nextBatch } = await supabase
    .from("waiting_list")
    .select("id, full_name, email")
    .eq("event_id", eventId)
    .is("claimed_at", null)
    // Nobody is offered the same seat twice: an entry that already holds a live
    // claim link is skipped until that link lapses. This is also what keeps a
    // second save a minute after the first from emailing everybody again.
    .or(`claim_expires_at.is.null,claim_expires_at.lt.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(offerable);

  if (!nextBatch || nextBatch.length === 0) return 0;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CLAIM_WINDOW_HOURS);

  const { data: event } = await supabase
    .from("events")
    .select("slug, title_ro")
    .eq("id", eventId)
    .single();

  // `.maybeSingle()` rather than `.single()`: the first time an event's waiting
  // list is notified there is no previous batch, and `.single()` treats "no
  // rows" as an error rather than as an empty result.
  const { data: lastNotification } = await supabase
    .from("waiting_list_notifications")
    .select("batch_number")
    .eq("event_id", eventId)
    .order("batch_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const batchNumber = (lastNotification?.batch_number || 0) + 1;

  await supabase.from("waiting_list_notifications").insert({
    event_id: eventId,
    batch_number: batchNumber,
    expires_at: expiresAt.toISOString(),
    // What was actually offered, not what was free: the audit log should say
    // how many links went out, and the list can be shorter than the seats.
    spots_opened: nextBatch.length,
  });

  // Stamp the window onto the entries themselves. This is what makes the claim
  // link checkable — without it the route has no way to know whether a token
  // was ever issued, or when it lapses.
  await supabase
    .from("waiting_list")
    .update({
      notified_at: new Date().toISOString(),
      claim_expires_at: expiresAt.toISOString(),
    })
    .in("id", nextBatch.map((entry) => entry.id));

  const { data: template } = await supabase
    .from("email_templates")
    .select("subject_ro, body_ro")
    .eq("type", "spot_available")
    .maybeSingle();

  if (!template) {
    console.error("No 'spot_available' email template; claim links were not sent.");
    return 0;
  }

  const eventSlug = event?.slug || eventId;

  // Sent in parallel rather than one after another. allSettled means one
  // bounced address cannot stop the rest of the batch going out.
  await Promise.allSettled(
    nextBatch.map((entry) => {
      const vars: Record<string, string> = {
        user_name: entry.full_name,
        event_name: event?.title_ro || "",
        // absoluteUrl(), not the raw environment variable. NEXT_PUBLIC_SITE_URL
        // is frequently unset, and reading it directly is what produced claim
        // links beginning "undefined/ro/events/..."; the helper falls back to
        // Vercel's own production URL.
        claim_url: absoluteUrl(`/ro/events/${eventSlug}?claim=${entry.id}`),
        // Formatted in Romania's timezone, not the server's. Vercel runs in
        // UTC, so this told people their link expired two or three hours before
        // the claim route actually stops accepting it — they would give up on a
        // seat that was still theirs.
        expires_at: expiresAt.toLocaleString("ro-RO", { timeZone: EVENT_TIME_ZONE }),
      };

      return getResend()
        .emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: entry.email,
          subject: fillEmailTemplate(template.subject_ro, vars),
          html: fillEmailTemplate(template.body_ro, vars),
        })
        .catch((error) => {
          console.error(`Claim link email failed for ${entry.email}:`, error);
        });
    })
  );

  return nextBatch.length;
}
