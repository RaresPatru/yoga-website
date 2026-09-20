import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendConfirmationEmail } from "@/lib/send-confirmation-email";
// Was defined in this file, when a refund or an expired checkout was the only
// way a seat came back. The admin panel can free seats too now, so the rule
// about when it is safe to email somebody lives with the function rather than
// in whichever caller remembers it.
import { notifyWaitingList } from "@/lib/notify-waiting-list";
import type Stripe from "stripe";

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
