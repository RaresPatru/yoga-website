import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendConfirmationEmail, fillEmailTemplate } from "@/lib/send-confirmation-email";
import { getResend } from "@/lib/resend";
import { absoluteUrl } from "@/lib/site-config";
import { EVENT_TIME_ZONE } from "@/lib/utils";
import type Stripe from "stripe";

/** How long someone has to use a claim link before it stops working. */
const CLAIM_WINDOW_HOURS = 24;

/**
 * Offers a freed seat to the people at the front of an event's waiting list.
 *
 * Called when a seat genuinely opens up: a Stripe checkout expired, or a
 * customer was refunded. Notifies as many people as there are seats, oldest
 * entry first, and gives each a link valid for CLAIM_WINDOW_HOURS.
 */
async function notifyWaitingList(eventId: string, spotsOpened: number = 1) {
  const supabase = createAdminClient();

  const { data: nextBatch } = await supabase
    .from("waiting_list")
    .select("id, full_name, email")
    .eq("event_id", eventId)
    .is("claimed_at", null)
    // Nobody is offered the same seat twice: an entry that already holds a live
    // claim link is skipped until that link lapses.
    .or(`claim_expires_at.is.null,claim_expires_at.lt.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(spotsOpened);

  if (!nextBatch || nextBatch.length === 0) return;

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
    spots_opened: spotsOpened,
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
    return;
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
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const body = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    const supabase = createAdminClient();

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const registrationId = session.metadata?.registrationId;

      if (registrationId) {
        // `.select()` returns the row we just changed, so we can email the
        // right person without a second lookup. The `.eq("payment_status",
        // "pending")` guard makes this safe to run twice: Stripe retries
        // webhooks it thinks failed, and without the guard a retry would send a
        // duplicate confirmation email. On a retry the row is already
        // 'completed', nothing matches, and we quietly do nothing.
        const { data: updated } = await supabase
          .from("registrations")
          .update({ payment_status: "completed", stripe_session_id: session.id })
          .eq("id", registrationId)
          .eq("payment_status", "pending")
          .select("event_id, full_name, email")
          .maybeSingle();

        if (updated) {
          // This is where a paying customer finally gets the calendar invite
          // and the WhatsApp link — after the money has arrived, not before.
          await sendConfirmationEmail({
            eventId: updated.event_id,
            fullName: updated.full_name,
            email: updated.email,
            templateType: "payment_confirmation",
          });
        }
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const registrationId = session.metadata?.registrationId;

      if (registrationId) {
        const { data: reg } = await supabase
          .from("registrations")
          .delete()
          .eq("id", registrationId)
          .eq("payment_status", "pending")
          .select("event_id")
          .maybeSingle();

        if (reg) {
          // Put anyone who claimed this seat back on the waiting list.
          //
          // A paid claim marks the waiting-list entry `claimed_at` as soon as
          // the Stripe session is created — before any payment. If the visitor
          // then abandons checkout (the common case), the seat is released
          // here, but without this the person who claimed it would be stranded:
          // notifyWaitingList only considers entries with `claimed_at is null`,
          // so they would be permanently off the list, holding a spent link,
          // with no way back.
          //
          // Clearing the claim returns them to their original position, and
          // because `created_at` is untouched they keep their place in the
          // queue rather than going to the back of it.
          await supabase
            .from("waiting_list")
            .update({
              claimed_at: null,
              claimed_registration_id: null,
              notified_at: null,
              claim_expires_at: null,
            })
            .eq("claimed_registration_id", registrationId);

          await notifyWaitingList(reg.event_id);
        }
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntent = charge.payment_intent?.toString();

      if (paymentIntent) {
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: paymentIntent,
          limit: 1,
        });

        const session = Array.isArray(sessions) ? sessions[0] : sessions.data[0];
        if (session) {
          const { data: registrations } = await supabase
            .from("registrations")
            .select("event_id")
            .eq("stripe_session_id", session.id)
            .limit(1);

          if (registrations && registrations.length > 0) {
            const eventId = registrations[0].event_id;

            await supabase
              .from("registrations")
              .update({ payment_status: "refunded" })
              .eq("stripe_session_id", session.id);

            await notifyWaitingList(eventId);
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 400 });
  }
}
