import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { sendConfirmationEmail } from "@/lib/send-confirmation-email";
import { getStripe } from "@/lib/stripe";

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
    const supabase = createAdminClient();

    // Written as one string literal rather than concatenated pieces: Supabase
    // infers the result type by parsing this at compile time, and a `+` join
    // defeats that, leaving every field typed as an error object.
    const { data: entry, error: findError } = await supabase
      .from("waiting_list")
      .select("id, event_id, full_name, email, phone, notified_at, claim_expires_at, events!inner(id, slug, title_ro, price, published)")
      .eq("id", token)
      .is("claimed_at", null)
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

    const isPaid = event.price > 0;

    // Free events are confirmed outright. Paid events get a 'pending'
    // registration and a trip to Stripe — the old code created a 'free'
    // registration regardless of price, so anyone on the waiting list for a
    // paid event got in without paying.
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "register_for_event",
      {
        p_event_id: entry.event_id,
        p_full_name: entry.full_name,
        p_email: entry.email,
        p_phone: entry.phone,
        p_payment_status: isPaid ? "pending" : "free",
      }
    );

    if (rpcError) throw rpcError;

    // Someone else took the seat first.
    if (rpcResult?.error) {
      return NextResponse.json({ error: rpcResult.error }, { status: 409 });
    }

    const registration = rpcResult;

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
    const origin =
      req.headers.get("origin")?.trim() || process.env.NEXT_PUBLIC_SITE_URL || "";
    let base: string;
    try {
      base = origin ? new URL(origin).origin : "";
    } catch {
      base = "";
    }
    if (!base) {
      await releaseSeat();
      return NextResponse.json({ error: "Missing origin" }, { status: 400 });
    }

    let checkoutUrl: string | null;
    try {
      const session = await getStripe().checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "ron",
              product_data: { name: event.title_ro },
              // Price comes from the database row, never from the request.
              unit_amount: event.price * 100,
            },
            quantity: 1,
          },
        ],
      // Expires in 30 minutes (Stripe's minimum). A short window matters
      // here: a pending registration holds a seat, and the seat only comes
      // back when Stripe reports the session expired. The database also stops
      // counting pending rows after an hour, so the two bound each other.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,

        mode: "payment",
        customer_email: entry.email,
        success_url: `${base}/ro/events/${event.slug}?success=1`,
        cancel_url: `${base}/ro/events/${event.slug}?canceled=1`,
        metadata: { eventId: entry.event_id, registrationId: registration.id },
      });
      checkoutUrl = session.url;
    } catch (stripeError) {
      // Stripe is down or misconfigured. Give the seat back and leave the claim
      // link unspent so they can try again, rather than stranding a pending
      // registration that can never be paid for.
      console.error("Stripe session creation failed during claim:", stripeError);
      await releaseSeat();
      return NextResponse.json(
        { error: "Nu am putut initia plata. Incearca din nou." },
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
