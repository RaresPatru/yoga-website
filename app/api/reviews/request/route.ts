import { NextResponse } from "next/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { EMAIL_RE } from "@/lib/validate-attendee";
import { requestReviewLinks } from "@/lib/reviews";

/**
 * "Send me the link": the form on /testimonials/share, which asks only for the
 * email someone booked with.
 *
 * It answers the same whether or not that email ever booked, so it cannot be
 * used to find out who took part in what; what happens next is in
 * requestReviewLinks() (lib/reviews.ts), and only the inbox that booked sees
 * it. Behind a CAPTCHA and two limits, one per visitor and one per email, so
 * nobody can fill someone's inbox with links by pressing the button.
 */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`review-request:${clientIp(req)}`, 5)) {
      return NextResponse.json({ error: "Too many attempts", code: "rate" }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    if (!body.captchaToken || !(await verifyTurnstile(body.captchaToken))) {
      return NextResponse.json({ error: "Security check failed", code: "captcha" }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Invalid email", code: "email" }, { status: 400 });
    }

    // Three a day per address. Past it, the answer is the same as ever, and
    // nothing more is sent.
    if (rateLimit(`review-request-email:${email}`, 3, 24 * 60 * 60 * 1000)) {
      await requestReviewLinks(email);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Review link request failed:", error);
    return NextResponse.json({ error: "Internal server error", code: "server" }, { status: 500 });
  }
}
