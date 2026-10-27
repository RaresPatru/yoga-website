/**
 * Promotion codes as the admin panel sees them, and the rules for making and
 * changing one. Kept free of server imports so the code screen and its routes
 * share them.
 *
 * A code lives in Stripe, not in the database: a Stripe coupon (how much
 * off) behind a promotion code (the word people type), so Stripe's checkout
 * applies it and counts its uses. Every Checkout session allows codes
 * (lib/stripe-checkout.ts). A code works on every event: line items are made
 * per checkout, so a coupon cannot be tied to one event's product.
 *
 * WHAT STRIPE WILL NOT DO, AND HOW THE SITE GETS ROUND IT
 *
 * Stripe never changes a promotion code once it is made, beyond switching it
 * on or off and the notes it keeps on it (metadata), and never deletes one:
 * a code may already have been used in a payment, and the record of that
 * payment must keep pointing at what was charged. Its coupon cannot change
 * its amount either. So the site does what a shop does with a printed
 * voucher (lib/stripe-codes.ts):
 *
 *   edit    switch the old code off and make a new one in its place, with
 *           the same word unless she changed it. Its notes say which code it
 *           replaced and how often the ones before it were used, so her list
 *           shows one code with one running count.
 *   delete  switch it off and note the deletion, which takes it off her list.
 *           Stripe keeps it, switched off, as the record of what it was.
 *
 * The notes (Stripe metadata) are below in META. A code made before any of
 * this, or in Stripe's own Dashboard, has none, and reads as its own first
 * version.
 */

import type Stripe from "stripe";
import { EVENT_TIME_ZONE } from "@/lib/utils";

export type DiscountKind = "percent" | "amount";

/** The notes the site keeps on a promotion code in Stripe. */
export const META = {
  /** The id of the first code of the line: every version of one code shares it. */
  lineage: "lineage",
  /** 0 for the first, then one more for each edit. The highest is the current one. */
  version: "version",
  /** When the first version was made, in Unix seconds: the date her list shows. */
  firstCreated: "first_created",
  /** Since when the code has had its word, in Unix seconds: who received it counts from here. */
  wordSince: "word_since",
  /** Uses of the versions before this one, which Stripe counts on those. */
  usesBefore: "uses_before",
  /** On a replaced version: the code that replaced it. */
  replacedBy: "replaced_by",
  /** She deleted it, in Unix seconds. */
  deletedAt: "deleted_at",
  /** Whether it was on when she deleted it, so Undo can put it back as it was. */
  wasActive: "was_active",
} as const;

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
  /** Uses in all, the versions an edit replaced included. */
  timesRedeemed: number;
  /** The limit in all, the earlier versions' uses included, or null for none. */
  maxRedemptions: number | null;
  /** ISO moment it stops working, or null for no end. */
  expiresAt: string | null;
  /** When she first made it: an edit keeps the date. */
  createdAt: string;
  /** Since when it has had this word. */
  wordSince: string;
  /** People an announcement carried this word to since `wordSince`. Filled in by the list route. */
  sentTo: number;
}

const number = (value: string | undefined): number | null => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const isoFromSeconds = (seconds: number) => new Date(seconds * 1000).toISOString();

/** The first code of this one's line: its own id when it has no notes. */
export function lineageOf(code: Pick<Stripe.PromotionCode, "id" | "metadata">): string {
  return code.metadata?.[META.lineage] || code.id;
}

/** Which version of its code this is: 0 for one never edited. */
export function versionNumberOf(code: Pick<Stripe.PromotionCode, "metadata">): number {
  return number(code.metadata?.[META.version]) ?? 0;
}

/** Uses of the versions before this one. */
export function usesBeforeOf(code: Pick<Stripe.PromotionCode, "metadata">): number {
  return number(code.metadata?.[META.usesBefore]) ?? 0;
}

/** Since when this code has had its word, in Unix seconds. */
export function wordSinceOf(code: Pick<Stripe.PromotionCode, "metadata" | "created">): number {
  return number(code.metadata?.[META.wordSince]) ?? code.created;
}

/** A Stripe promotion code, with its coupon expanded, as the screen shows it. */
export function viewOf(code: Stripe.PromotionCode, sentTo = 0): PromotionCodeView {
  const coupon = typeof code.promotion.coupon === "object" ? code.promotion.coupon : null;
  const before = usesBeforeOf(code);
  return {
    id: code.id,
    code: code.code,
    active: code.active,
    percentOff: coupon?.percent_off ?? null,
    amountOff: coupon?.amount_off != null ? coupon.amount_off / 100 : null,
    currency: coupon?.currency ? coupon.currency.toUpperCase() : null,
    timesRedeemed: before + code.times_redeemed,
    maxRedemptions: code.max_redemptions !== null ? before + code.max_redemptions : null,
    expiresAt: code.expires_at ? isoFromSeconds(code.expires_at) : null,
    createdAt: isoFromSeconds(number(code.metadata?.[META.firstCreated]) ?? code.created),
    wordSince: isoFromSeconds(wordSinceOf(code)),
    sentTo,
  };
}

/** What the create and edit forms send. */
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
 * Checks a new or edited code before Stripe sees it, and says what is wrong
 * in a word the form translates: code, value, currency, last_day, uses.
 */
export function validateNewCode(input: NewPromotionCode, today: string): string | null {
  if (typeof input?.code !== "string" || !CODE_RE.test(normaliseCode(input.code))) return "code";
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

export type CodeStatus = "active" | "off" | "expired" | "used_up";

/**
 * Where a code stands. A code past its last day or out of uses says so even
 * when it is also switched off: that is the reason it no longer works, and
 * switching it on would not change it.
 */
export function codeStatus(code: PromotionCodeView, now: number): CodeStatus {
  if (code.expiresAt && Date.parse(code.expiresAt) <= now) return "expired";
  if (code.maxRedemptions !== null && code.timesRedeemed >= code.maxRedemptions) return "used_up";
  if (!code.active) return "off";
  return "active";
}

/** The last day a code works, as YYYY-MM-DD in Romania: the moment it stops is midnight after it. */
export function lastDayOf(expiresAt: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE }).format(new Date(Date.parse(expiresAt) - 1000));
}

/** A code as the form holds it, to edit. */
export function formOf(code: PromotionCodeView): NewPromotionCode {
  return {
    code: code.code,
    kind: code.percentOff !== null ? "percent" : "amount",
    value: code.percentOff ?? code.amountOff ?? 0,
    currency: code.currency ?? undefined,
    lastDay: code.expiresAt ? lastDayOf(code.expiresAt) : undefined,
    maxRedemptions: code.maxRedemptions,
  };
}

export interface CodeChanges {
  /** The word people type. */
  word: boolean;
  /** How much off: the kind, the number or the currency. */
  discount: boolean;
  /** The last day, set, moved or taken away. */
  lastDay: boolean;
  /** The number of uses. */
  uses: boolean;
}

/** What an edit changes. Uses alone never needs a warning: nobody was promised a number. */
export function changesBetween(code: PromotionCodeView, next: NewPromotionCode): CodeChanges {
  const before = formOf(code);
  return {
    word: normaliseCode(next.code) !== before.code.toUpperCase(),
    discount:
      next.kind !== before.kind ||
      next.value !== before.value ||
      (next.kind === "amount" && (next.currency ?? "") !== (before.currency ?? "")),
    lastDay: (next.lastDay || "") !== (before.lastDay || ""),
    uses: (next.maxRedemptions ?? null) !== (before.maxRedemptions ?? null),
  };
}
