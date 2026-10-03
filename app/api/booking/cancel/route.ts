import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { cancelBooking } from "@/lib/cancel-booking";

/**
 * The Cancel button on /[locale]/booking, the page the link in a
 * confirmation email opens. A plain form post, so it works the moment the
 * page shows, before any JavaScript, in an in-app browser that is slow to
 * load the rest; the answer is a redirect back to the page, which then shows
 * the booking as it now stands.
 *
 * Only POST cancels. Mail scanners open every link in an email to check it,
 * and a link that cancelled on its own would cancel bookings nobody meant to,
 * as the unsubscribe link would unsubscribe (app/api/unsubscribe).
 *
 * What cancelling does with the money is lib/cancel-booking.ts.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const field = form?.get("token");
  const token = typeof field === "string" ? field : "";
  const locale = form?.get("locale") === "en" ? "en" : "ro";

  const back = (result: string) =>
    NextResponse.redirect(
      new URL(`/${locale}/booking?token=${encodeURIComponent(token)}&result=${result}`, request.url),
      303
    );

  if (!rateLimit(`booking-cancel:${clientIp(request)}`, 20)) return back("busy");

  try {
    return back(await cancelBooking(token));
  } catch (error) {
    console.error("Cancelling a booking failed:", error);
    return back("error");
  }
}
