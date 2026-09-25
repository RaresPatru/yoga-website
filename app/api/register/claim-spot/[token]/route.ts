import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { sendConfirmationEmail } from "@/lib/send-confirmation-email";
import { createCheckoutSession, type CheckoutLocale } from "@/lib/stripe-checkout";
import { hasStarted, registerForEvent } from "@/lib/register-for-event";

/**
 * Claims a seat that opened up on a full event.
 *
 * The `token` in the URL is the waiting-list entry's own id (a UUID), emailed
 * to the person when a seat freed up. It is a bearer token: whoever holds the
 * link can claim, which is fine — the link only ever goes to the address they
 * signed up with, and the worst case is that a seat they wanted goes to them.
 *
 * Three checks that were previously missing:
 *
 *   1. Was a link ever actually issued for this entry? (`notified_at`)
 *   2. Is it still inside the 24-hour window? (`claim_expires_at`)
 *   3. Is the event free? A paid event must go through Stripe, not be handed
 *      over gratis.
 *
 * And two answers that are not errors:
 *
 *   - The event has started: bookings are closed, the link with them.
 *   - Somebody booked the seat first. The seat was never reserved: a claim
 *     link is a head start, not a hold. They see an apology, and their offer
 *     is withdrawn rather than left running, which puts them back where they
 *     were, at the front of the queue, for the next seat that opens.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // The token is a UUID, so guessing one is not realistic — but rate limiting
    // it costs nothing and stops someone hammering the endpoint to find out
    // whether a given ID exists, which the different 404/409 responses would
    // otherwise reveal.
    if (!rateLimit(`claim-spot:${clientIp(req)}`, 20)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const { token } = await params;
    // The page the link opened on says which language Stripe's pages and the
    // return address should use. Anything unexpected falls back to Romanian.
    const body = await req.json().catch(() => ({}));
    const locale: CheckoutLocale = body?.locale === "en" ? "en" : "ro";
    const supabase = createAdminClient();

    // Written as one string literal rather than concatenated pieces: Supabase
    // infers the result type by parsing this at compile time, and a `+` join
    // defeats that, leaving every field typed as an error object.
    const { data: entry, error: findError } = await supabase
      .from("waiting_list")
      .select("id, event_id, full_name, email, phone, locale, notified_at, claim_expires_at, events!inner(id, slug, title_ro, title_en, price, currency, published, starts_at)")
      .eq("id", token)
      .is("claimed_at", null)
      .is("removed_at", null)
      .maybeSingle();

    if (findError || !entry) {
      return NextResponse.json(
        { error: "Invalid or expired claim link" },
        { status: 404 }
      );
    }

    // Never notified means this id was never handed out as a claim token.
    // Somebody has guessed or scraped it; treat it exactly like a bad link.
    if (!entry.notified_at || !entry.claim_expires_at) {
      return NextResponse.json(
        { error: "Invalid or expired claim link" },
        { status: 404 }
      );
    }

    // The 24-hour window the email promised, now actually enforced. Compared on
    // the server: a client clock cannot be trusted to decide this.
    if (new Date(entry.claim_expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        {
          error: "Linkul a expirat. Locul a fost oferit altcuiva.",
          expired: true,
        },
        { status: 410 } // 410 Gone: it existed, it is finished
      );
    }

    // Supabase types an embedded relation as an array; the !inner join means
    // exactly one row.
    const event = Array.isArray(entry.events) ? entry.events[0] : entry.events;

    if (!event?.published) {
      return NextResponse.json({ error: "Event not available" }, { status: 404 });
    }

    if (hasStarted(event.starts_at)) {
      return NextResponse.json({ error: "Event has started", code: "started" }, { status: 409 });
    }

    const isPaid = event.price > 0;

    // Free events are confirmed outright. Paid events get a 'pending'
    // registration and a trip to Stripe — the old code created a 'free'
    // registration regardless of price, so anyone on the waiting list for a
    // paid event got in without paying.
    const booking = await registerForEvent(supabase, {
      p_event_id: entry.event_id,
      p_full_name: entry.full_name,
      p_email: entry.email,
      p_phone: entry.phone,
      p_payment_status: isPaid ? "pending" : "free",
      p_locale: entry.locale === "en" ? "en" : "ro",
    });

    if (!booking.ok) {
      /*
       * Someone else took the seat first. Their offer is withdrawn rather than
       * left to run: a live offer is counted as a promised seat by
       * notifyWaitingList(), so leaving it would stop the next seat being
       * offered to anyone, them included. With notified_at and
       * claim_expires_at cleared they are simply waiting again, and the queue
       * is in the order people joined, so they are first.
       */
      if (booking.code === "full") {
        const { error: resetError } = await supabase
          .from("waiting_list")
          .update({ notified_at: null, claim_expires_at: null })
          .eq("id", token);
        if (resetError) console.error("Could not return the claim to the queue:", resetError);
        return NextResponse.json({ error: booking.reason, code: "taken" }, { status: 409 });
      }
      return NextResponse.json({ error: booking.reason, code: booking.code }, { status: 409 });
    }

    const registration = { id: booking.id };

    /**
     * Marks the waiting-list entry as used. Deliberately NOT called until the
     * work that can still fail has succeeded.
     *
     * Order matters here. Marking the claim first and then talking to Stripe
     * meant that if Stripe was unreachable, the visitor got an error page while
     * their one-time link was already spent and a pending registration sat
     * holding a seat nobody could pay for. Doing it last means a failure leaves
     * the link usable and the seat free — they can simply click it again.
     */
    const markClaimed = () =>
      supabase
        .from("waiting_list")
        .update({
          claimed_at: new Date().toISOString(),
          claimed_registration_id: registration.id,
        })
        .eq("id", token);

    /** Undoes the held seat when the rest of the flow cannot be completed. */
    const releaseSeat = () =>
      supabase.from("registrations").delete().eq("id", registration.id);

    if (!isPaid) {
      await markClaimed();
      await sendConfirmationEmail({
        eventId: entry.event_id,
        fullName: entry.full_name,
        email: entry.email,
        templateType: "registration_confirmation",
      });
      return NextResponse.json({ success: true });
    }

    // Paid: hand back a Stripe Checkout URL for the page to redirect to. The
    // seat is held by the 'pending' registration in the meantime, and released
    // by the checkout.session.expired webhook if they never pay.
    let checkoutUrl: string;
    try {
      checkoutUrl = await createCheckoutSession({
        event,
        registrationId: registration.id,
        email: entry.email,
        locale,
      });
    } catch (stripeError) {
      // Stripe is down or misconfigured. Give the seat back and leave the claim
      // link unspent so they can try again, rather than stranding a pending
      // registration that can never be paid for.
      console.error("Stripe session creation failed during claim:", stripeError);
      await releaseSeat();
      return NextResponse.json(
        {
          error:
            locale === "en"
              ? "We couldn't start the payment. Please try again."
              : "Nu am putut iniția plata. Încearcă din nou.",
        },
        { status: 502 }
      );
    }

    // Only now is the one-time link considered used.
    await markClaimed();

    return NextResponse.json({ success: true, checkoutUrl });
  } catch (error) {
    console.error("Claim spot error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
