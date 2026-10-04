import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl, siteUrl } from "@/lib/site-config";
import { emailLocale, emailMoment, eventEmailVars } from "@/lib/email-content";
import { loadTemplate, sendTemplateEmail } from "@/lib/email";

/** How long someone has to use a claim link before it stops working. */
export const CLAIM_WINDOW_HOURS = 24;

/**
 * Offers the free seats on an event to the people at the front of its waiting
 * list, oldest entry first.
 *
 * WHO CALLS IT
 *
 * Anything that can give a seat back: the Stripe webhook when a checkout
 * expires or a payment is refunded, her Registrations page when she removes
 * someone or marks a refund, and the events editor after every save (she may
 * have raised the capacity). None of them says how many people to offer a
 * seat to, and none can: each used to get it wrong in the same direction,
 * emailing links to seats that did not exist.
 *
 * WHAT HAPPENS
 *
 * 1. offer_waiting_list_seats() decides, in the database, under a lock on the
 *    event row: how many seats are free (the capacity, less the bookings that
 *    hold one, less the claim links still running), and who is next in line.
 *    It stamps each of them with a claim window and returns them. Nothing is
 *    offered for an event that is unpublished, has started, or is sold out
 *    (a capacity of NULL or 0).
 *
 *    It used to be three separate requests from here (count, choose, stamp),
 *    so a Stripe webhook and a save arriving together could both count the
 *    same free seat and send more links than there were seats (audit B16).
 *    The lock is the one register_for_event() takes, so offers and bookings
 *    on the same event wait for each other.
 *
 * 2. Each person is emailed, in the language they joined the list in.
 *
 * 3. settle_waiting_list_offers() withdraws the offers whose email did not go,
 *    so a seat is never held for somebody who was never told (they are simply
 *    waiting again, first in line), and records the ones that went (B9).
 *
 * The template is checked first: without it no email can go, and an offer
 * nobody is told about only holds a seat back from everyone.
 *
 * Returns how many people were emailed, which is 0 for most calls.
 */
export async function notifyWaitingList(eventId: string): Promise<number> {
  const supabase = createAdminClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("slug, title_ro, title_en, date, time, end_date, end_time, location, starts_at")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) {
    console.error("Could not read the event for its waiting list:", eventError);
    return 0;
  }
  if (!event || Date.parse(event.starts_at) <= Date.now()) return 0;

  if (!(await loadTemplate(supabase, "spot_available", "ro"))) {
    console.error("No 'spot_available' email template; nobody was offered a seat.");
    return 0;
  }

  const { data: offers, error: offerError } = await supabase.rpc("offer_waiting_list_seats", {
    p_event_id: eventId,
    p_hours: CLAIM_WINDOW_HOURS,
  });
  if (offerError) {
    console.error("Could not offer the free seats:", offerError);
    return 0;
  }
  if (!offers?.length) return 0;

  // In parallel: each send reports its own outcome, so one bounced address
  // cannot stop the rest of the batch.
  const outcomes = await Promise.all(
    offers.map(async (entry) => {
      const locale = emailLocale(entry.locale);
      const result = await sendTemplateEmail({
        type: "spot_available",
        locale,
        to: entry.email,
        vars: {
          user_name: entry.full_name,
          ...eventEmailVars(event, locale, siteUrl()),
          claim_url: absoluteUrl(`/${locale}/events/${encodeURIComponent(event.slug || eventId)}?claim=${entry.id}`),
          // In Romania's time, the zone the claim route's deadline is meant
          // in: Vercel runs in UTC, which would tell people their link lapses
          // two or three hours before it does.
          expires_at: emailMoment(new Date(entry.claim_expires_at), locale),
        },
      });
      if (!result.ok) console.error(`Claim link email failed for entry ${entry.id}:`, result.error);
      return { id: entry.id, sent: result.ok };
    })
  );

  const sent = outcomes.filter((o) => o.sent).map((o) => o.id);
  const unsent = outcomes.filter((o) => !o.sent).map((o) => o.id);
  const { error: settleError } = await supabase.rpc("settle_waiting_list_offers", {
    p_event_id: eventId,
    p_sent: sent,
    p_unsent: unsent,
  });
  if (settleError) console.error("Could not settle the waiting-list offers:", settleError);

  return sent.length;
}
