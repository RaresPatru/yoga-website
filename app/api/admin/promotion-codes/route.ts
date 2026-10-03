import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/is-admin";
import { getStripe } from "@/lib/stripe";
import { EVENT_TIME_ZONE, zonedWallClockToUtc } from "@/lib/utils";
import { normaliseCode, validateNewCode, viewOf, type NewPromotionCode } from "@/lib/promotion-codes";

/**
 * Her promotion codes, for the Coduri de reducere screen. They live in
 * Stripe, which applies them at checkout and counts their uses, so this
 * route only lists and creates them there; lib/promotion-codes.ts says why.
 *
 *   GET   every code, newest first, with how often each was used
 *   POST  a new code: a coupon (how much off, once per payment) and the
 *         promotion code people type
 */

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const list = await getStripe().promotionCodes.list({ limit: 100, expand: ["data.promotion.coupon"] });
    return NextResponse.json({ codes: list.data.map(viewOf) });
  } catch (error) {
    console.error("Could not list promotion codes:", error);
    return NextResponse.json({ error: "Stripe could not be reached", code: "stripe" }, { status: 502 });
  }
}

/** Today's date where her events happen, as YYYY-MM-DD. */
function todayInRomania(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE }).format(new Date());
}

/** The moment a code whose last day is `day` stops: midnight after it, in Romania. */
function endOfDay(day: string): number {
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return Math.floor(zonedWallClockToUtc(next, "00:00", EVENT_TIME_ZONE).getTime() / 1000);
}

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const input = (await request.json().catch(() => ({}))) as NewPromotionCode;
  const problem = validateNewCode(input, todayInRomania());
  if (problem) return NextResponse.json({ error: "Invalid code", code: problem }, { status: 400 });

  const code = normaliseCode(input.code);
  const stripe = getStripe();
  try {
    // A live code with the same word would make the new one ambiguous;
    // Stripe refuses it too, in words the form cannot translate.
    const existing = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    if (existing.data.length > 0) {
      return NextResponse.json({ error: "A live code already uses this word", code: "exists" }, { status: 409 });
    }

    const coupon = await stripe.coupons.create({
      name: code,
      duration: "once",
      ...(input.kind === "percent"
        ? { percent_off: input.value }
        : { amount_off: Math.round(input.value * 100), currency: input.currency!.toLowerCase() }),
    });
    const created = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: coupon.id },
      code,
      ...(input.lastDay ? { expires_at: endOfDay(input.lastDay) } : {}),
      ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
      expand: ["promotion.coupon"],
    });
    return NextResponse.json({ code: viewOf(created) });
  } catch (error) {
    console.error("Could not create a promotion code:", error);
    return NextResponse.json({ error: (error as Error).message, code: "stripe" }, { status: 502 });
  }
}
