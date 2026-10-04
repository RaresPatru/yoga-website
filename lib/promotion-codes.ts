/**
 * Promotion codes as the admin panel sees them, and the rules for making one.
 * Kept free of server imports so the code screen and its route share them.
 *
 * A code lives in Stripe, not in the database: a Stripe coupon (how much
 * off) behind a promotion code (the word people type), so Stripe's checkout
 * applies it and counts its uses. Every Checkout session allows codes
 * (lib/stripe-checkout.ts). A code works on every event: line items are made
 * per checkout, so a coupon cannot be tied to one event's product.
 */

import type Stripe from "stripe";

export type DiscountKind = "percent" | "amount";

/** A code as the code screen lists it. */
export interface PromotionCodeView {
  id: string;
  code: string;
  active: boolean;
  /** 1-100 for a percentage, else null. */
  percentOff: number | null;
  /** In whole units of `currency` (lei, euro) for a fixed amount, else null. */
  amountOff: number | null;
  /** Uppercase ISO code for a fixed amount, else null. */
  currency: string | null;
  timesRedeemed: number;
  maxRedemptions: number | null;
  /** ISO moment it stops working, or null for no end. */
  expiresAt: string | null;
  createdAt: string;
}

/** A Stripe promotion code, with its coupon expanded, as the screen shows it. */
export function viewOf(code: Stripe.PromotionCode): PromotionCodeView {
  const coupon = typeof code.promotion.coupon === "object" ? code.promotion.coupon : null;
  return {
    id: code.id,
    code: code.code,
    active: code.active,
    percentOff: coupon?.percent_off ?? null,
    amountOff: coupon?.amount_off != null ? coupon.amount_off / 100 : null,
    currency: coupon?.currency ? coupon.currency.toUpperCase() : null,
    timesRedeemed: code.times_redeemed,
    maxRedemptions: code.max_redemptions,
    expiresAt: code.expires_at ? new Date(code.expires_at * 1000).toISOString() : null,
    createdAt: new Date(code.created * 1000).toISOString(),
  };
}

/** What the create form sends. */
export interface NewPromotionCode {
  code: string;
  kind: DiscountKind;
  /** Percent (1-100) or whole units of currency. */
  value: number;
  /** For a fixed amount: RON or EUR. */
  currency?: string;
  /** Last day it works, YYYY-MM-DD in Romania's time, or empty for no end. */
  lastDay?: string;
  /** How many times it may be used in all, or empty for no limit. */
  maxRedemptions?: number | null;
}

/** Letters, digits and dashes, as Stripe allows; stored in capitals so "vara10" and "VARA10" are one code. */
export const CODE_RE = /^[A-Z0-9-]{3,30}$/;

/** The currencies a fixed-amount code can be in: the ones events are priced in here. */
export const CODE_CURRENCIES = ["RON", "EUR"] as const;

export function normaliseCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Checks a new code before Stripe sees it, and says what is wrong in a word
 * the form translates: code, value, currency, last_day, uses.
 */
export function validateNewCode(input: NewPromotionCode, today: string): string | null {
  if (!CODE_RE.test(normaliseCode(input.code))) return "code";
  if (input.kind !== "percent" && input.kind !== "amount") return "value";
  if (!Number.isFinite(input.value) || input.value <= 0) return "value";
  if (input.kind === "percent" && (input.value > 100 || !Number.isInteger(input.value))) return "value";
  if (input.kind === "amount") {
    if (!CODE_CURRENCIES.includes(input.currency as (typeof CODE_CURRENCIES)[number])) return "currency";
    if (Math.round(input.value * 100) !== input.value * 100) return "value";
  }
  if (input.lastDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.lastDay) || input.lastDay < today) return "last_day";
  }
  if (input.maxRedemptions !== undefined && input.maxRedemptions !== null) {
    if (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions < 1) return "uses";
  }
  return null;
}
