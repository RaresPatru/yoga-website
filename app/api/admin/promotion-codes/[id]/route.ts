import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/is-admin";
import { getStripe } from "@/lib/stripe";
import { viewOf } from "@/lib/promotion-codes";

/**
 * Turns one promotion code off, or on again. Stripe never deletes a code that
 * may have been used, so "off" is how a code ends early: it stops working at
 * checkout and stays in the list with its count. A code can be turned on
 * again only while its coupon is still valid; Stripe refuses otherwise.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!/^promo_[A-Za-z0-9]{6,100}$/.test(id)) {
    return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "Say active: true or false", code: "invalid" }, { status: 400 });
  }
  try {
    const updated = await getStripe().promotionCodes.update(id, {
      active: body.active,
      expand: ["promotion.coupon"],
    });
    return NextResponse.json({ code: viewOf(updated) });
  } catch (error) {
    console.error(`Could not change promotion code ${id}:`, error);
    return NextResponse.json({ error: (error as Error).message, code: "stripe" }, { status: 502 });
  }
}
