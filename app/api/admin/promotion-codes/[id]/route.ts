import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/is-admin";
import type { NewPromotionCode } from "@/lib/promotion-codes";
import {
  deletePromotionCode,
  editPromotionCode,
  refusalResponse,
  restorePromotionCode,
  setPromotionCodeActive,
} from "@/lib/stripe-codes";

/**
 * One promotion code (lib/stripe-codes.ts does the work):
 *
 *   POST    { active }       switches it on or off
 *   POST    { restore: true } puts back a code she has just deleted (Undo)
 *   PATCH   the form's fields changes it: a new version replaces the old
 *   DELETE  takes it off her list, switched off
 *
 * Stripe keeps every code that may have been used and never changes one,
 * which is why a change makes a new version and a deletion only switches
 * one off; lib/promotion-codes.ts explains.
 */

type Params = { params: Promise<{ id: string }> };

const ID = /^promo_[A-Za-z0-9]{6,100}$/;

async function codeId(request: Request, { params }: Params): Promise<string | NextResponse> {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
  return id;
}

export async function POST(request: Request, context: Params) {
  const id = await codeId(request, context);
  if (typeof id !== "string") return id;
  const body = await request.json().catch(() => ({}));
  try {
    if (body?.restore === true) return NextResponse.json({ code: await restorePromotionCode(id) });
    if (typeof body?.active !== "boolean") {
      return NextResponse.json({ error: "Say active: true or false", code: "invalid" }, { status: 400 });
    }
    return NextResponse.json({ code: await setPromotionCodeActive(id, body.active) });
  } catch (error) {
    return refusalResponse(error, `Could not change promotion code ${id}`);
  }
}

export async function PATCH(request: Request, context: Params) {
  const id = await codeId(request, context);
  if (typeof id !== "string") return id;
  const input = (await request.json().catch(() => ({}))) as NewPromotionCode;
  try {
    return NextResponse.json({ code: await editPromotionCode(id, input) });
  } catch (error) {
    return refusalResponse(error, `Could not edit promotion code ${id}`);
  }
}

export async function DELETE(request: Request, context: Params) {
  const id = await codeId(request, context);
  if (typeof id !== "string") return id;
  try {
    await deletePromotionCode(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return refusalResponse(error, `Could not delete promotion code ${id}`);
  }
}
