import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NewPromotionCode } from "@/lib/promotion-codes";
import { viewOf } from "@/lib/promotion-codes";
import {
  createPromotionCode,
  currentCodes,
  everyCode,
  recordAnnouncementCodes,
  refusalResponse,
  sentCounts,
} from "@/lib/stripe-codes";

/**
 * Her promotion codes, for the Coduri de reducere screen. They live in
 * Stripe, which applies them at checkout and counts their uses
 * (lib/promotion-codes.ts says why, and lib/stripe-codes.ts does the work).
 *
 *   GET   her codes, newest first, each with how often it was used and how
 *         many people an announcement carried it to
 *   POST  a new code
 *
 * The GET also records the codes in any sent announcement not yet looked at
 * (one sent before this existed, or while Stripe could not be reached), so
 * the counts it answers with are complete. That part is best effort: the
 * list is what she came for.
 */

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let all;
  try {
    all = await everyCode();
  } catch (error) {
    console.error("Could not list promotion codes:", error);
    return NextResponse.json({ error: "Stripe could not be reached", code: "stripe" }, { status: 502 });
  }

  const service = createAdminClient();
  try {
    await recordAnnouncementCodes(service, { codes: all });
  } catch (error) {
    console.error("Could not record the codes in sent announcements:", error);
  }
  const codes = currentCodes(all).map((code) => viewOf(code));
  let counts = new Map<string, number>();
  try {
    counts = await sentCounts(service, codes);
  } catch (error) {
    console.error("Could not count who received each code:", error);
  }
  return NextResponse.json({ codes: codes.map((code) => ({ ...code, sentTo: counts.get(code.id) ?? 0 })) });
}

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const input = (await request.json().catch(() => ({}))) as NewPromotionCode;
  try {
    return NextResponse.json({ code: await createPromotionCode(input) });
  } catch (error) {
    return refusalResponse(error, "Could not create a promotion code");
  }
}
