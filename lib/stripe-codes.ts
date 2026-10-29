import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getStripe } from "@/lib/stripe";
import { codesCarried } from "@/lib/announcement-codes";
import {
  META,
  changesBetween,
  codeStatus,
  lineageOf,
  normaliseCode,
  usesBeforeOf,
  validateNewCode,
  versionNumberOf,
  viewOf,
  wordSinceOf,
  type NewPromotionCode,
  type PromotionCodeView,
} from "@/lib/promotion-codes";
import { EVENT_TIME_ZONE, zonedWallClockToUtc } from "@/lib/utils";

/**
 * Her discount codes in Stripe: listing, making, changing, deleting and
 * putting back, for /api/admin/promotion-codes. Server only, because it
 * holds the secret key. lib/promotion-codes.ts explains why an edit makes a
 * new code and a deletion only switches one off, and what the notes on each
 * code (META) record.
 *
 * Also the record of which codes her announcements carried
 * (announcement_codes), which only the server can write, from the codes
 * that existed in Stripe when each was sent.
 */

type Service = SupabaseClient<Database>;

const EXPAND = ["promotion.coupon"];

/** Why the site refused, as a word the form translates, with the HTTP status the route answers. */
export class CodeRefusal extends Error {
  constructor(
    readonly reason: string,
    readonly status: number,
    readonly details: Record<string, number> = {}
  ) {
    super(reason);
  }
}

/** A refusal as the routes answer it: the form's word, or Stripe's own message when Stripe said no. */
export function refusalResponse(error: unknown, context: string) {
  if (error instanceof CodeRefusal) {
    return NextResponse.json({ error: error.reason, code: error.reason, ...error.details }, { status: error.status });
  }
  console.error(`${context}:`, error);
  return NextResponse.json({ error: (error as Error).message, code: "stripe" }, { status: 502 });
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Today's date where her events happen, as YYYY-MM-DD. */
export function todayInRomania(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE }).format(new Date());
}

/** The moment a code whose last day is `day` stops: midnight after it, in Romania. */
function endOfDay(day: string): number {
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return Math.floor(zonedWallClockToUtc(next, "00:00", EVENT_TIME_ZONE).getTime() / 1000);
}

/** Every promotion code in Stripe, every version of each, with its coupon. */
export async function everyCode(): Promise<Stripe.PromotionCode[]> {
  return getStripe()
    .promotionCodes.list({ limit: 100, expand: ["data.promotion.coupon"] })
    .autoPagingToArray({ limit: 10_000 });
}

/**
 * Her codes as her list shows them: the latest version of each, without the
 * ones she deleted, the one she made most recently first.
 */
export function currentCodes(all: Stripe.PromotionCode[]): Stripe.PromotionCode[] {
  const latest = new Map<string, Stripe.PromotionCode>();
  for (const code of all) {
    const line = lineageOf(code);
    const seen = latest.get(line);
    if (
      !seen ||
      versionNumberOf(code) > versionNumberOf(seen) ||
      (versionNumberOf(code) === versionNumberOf(seen) && code.created > seen.created)
    ) {
      latest.set(line, code);
    }
  }
  return [...latest.values()]
    .filter((code) => !code.metadata?.[META.deletedAt])
    .map((code) => ({ code, made: Date.parse(viewOf(code).createdAt) }))
    .sort((a, b) => b.made - a.made)
    .map(({ code }) => code);
}

async function retrieve(id: string): Promise<Stripe.PromotionCode> {
  try {
    return await getStripe().promotionCodes.retrieve(id, { expand: EXPAND });
  } catch (error) {
    if ((error as { code?: string }).code === "resource_missing") throw new CodeRefusal("not_found", 404);
    throw error;
  }
}

/** A version an edit replaced, or one she deleted: the list she acted from is out of date. */
function assertCurrent(code: Stripe.PromotionCode) {
  if (code.metadata?.[META.replacedBy] || code.metadata?.[META.deletedAt]) throw new CodeRefusal("stale", 409);
}

/**
 * Makes `word` free for a code about to be switched on with it. Stripe
 * allows one active code per word, so a live one with it refuses, as it
 * always has. One that can no longer be used (past its last day, or out of
 * uses) is switched off instead: it is worth nothing, and it was in the way.
 */
async function clearWord(word: string, except?: string): Promise<void> {
  const stripe = getStripe();
  const active = (await stripe.promotionCodes.list({ code: word, active: true, limit: 100, expand: ["data.promotion.coupon"] })).data.filter(
    (code) => code.id !== except
  );
  const now = Date.now();
  if (active.some((code) => codeStatus(viewOf(code), now) === "active")) throw new CodeRefusal("exists", 409);
  for (const code of active) await stripe.promotionCodes.update(code.id, { active: false });
}

/** A coupon for how much off, named after the word so Stripe's Dashboard reads the same. */
function couponFor(word: string, input: NewPromotionCode): Promise<Stripe.Coupon> {
  return getStripe().coupons.create({
    name: word,
    duration: "once",
    ...(input.kind === "percent"
      ? { percent_off: input.value }
      : { amount_off: Math.round(input.value * 100), currency: input.currency!.toLowerCase() }),
  });
}

const couponIdOf = (code: Stripe.PromotionCode) =>
  typeof code.promotion.coupon === "string" ? code.promotion.coupon : code.promotion.coupon!.id;

/** A new code: a coupon (how much off, once per payment) and the promotion code people type. */
export async function createPromotionCode(input: NewPromotionCode): Promise<PromotionCodeView> {
  const problem = validateNewCode(input, todayInRomania());
  if (problem) throw new CodeRefusal(problem, 400);
  const word = normaliseCode(input.code);
  await clearWord(word);
  const coupon = await couponFor(word, input);
  const created = await getStripe().promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code: word,
    ...(input.lastDay ? { expires_at: endOfDay(input.lastDay) } : {}),
    ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
    expand: EXPAND,
  });
  return viewOf(created);
}

/**
 * Changes a code, the only way Stripe allows: the old version is switched
 * off and a new one made in its place, whose notes carry the line on (the
 * first version's id and date, how often the earlier versions were used, and
 * since when the word has been the word).
 *
 * The old version goes off first. Stripe allows only one active code per
 * word, and once it is off its count stops moving, so the uses carried over
 * are the final ones. If making the new version fails, the old one is put
 * back on, and nothing has changed.
 *
 * The limit she types is for all uses, so the new version is allowed what is
 * left of it, and a limit at or below what has already been used is refused:
 * there would be nothing left.
 */
export async function editPromotionCode(id: string, input: NewPromotionCode): Promise<PromotionCodeView> {
  const stripe = getStripe();
  const old = await retrieve(id);
  assertCurrent(old);
  const problem = validateNewCode(input, todayInRomania());
  if (problem) throw new CodeRefusal(problem, 400);

  const before = viewOf(old);
  const changes = changesBetween(before, input);
  if (!changes.word && !changes.discount && !changes.lastDay && !changes.uses) return before;

  const word = normaliseCode(input.code);
  const remaining = (used: number): number | null => {
    if (input.maxRedemptions === undefined || input.maxRedemptions === null) return null;
    if (input.maxRedemptions <= used) throw new CodeRefusal("uses_below", 400, { used, min: used + 1 });
    return input.maxRedemptions - used;
  };
  remaining(before.timesRedeemed); // refused before anything changes, as far as can be known yet
  if (changes.word) await clearWord(word, old.id);

  const stopped = await stripe.promotionCodes.update(old.id, { active: false });
  const used = usesBeforeOf(old) + stopped.times_redeemed;
  const putBack = async () => {
    if (!old.active) return;
    await stripe.promotionCodes
      .update(old.id, { active: true })
      .catch((error) => console.error(`Could not switch promotion code ${old.id} back on:`, error));
  };

  let replacement: Stripe.PromotionCode;
  try {
    const limit = remaining(used);
    // The same coupon when only the last day or the uses change; a new one
    // when the amount or the word does, since its name is the word.
    const coupon = changes.discount || changes.word ? (await couponFor(word, input)).id : couponIdOf(old);
    replacement = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon },
      code: word,
      active: old.active,
      ...(input.lastDay ? { expires_at: endOfDay(input.lastDay) } : {}),
      ...(limit !== null ? { max_redemptions: limit } : {}),
      metadata: {
        [META.lineage]: lineageOf(old),
        [META.version]: String(versionNumberOf(old) + 1),
        [META.firstCreated]: old.metadata?.[META.firstCreated] || String(old.created),
        [META.wordSince]: String(changes.word ? nowSeconds() : wordSinceOf(old)),
        [META.usesBefore]: String(used),
      },
      expand: EXPAND,
    });
  } catch (error) {
    await putBack();
    throw error;
  }

  // Only a pointer for whoever reads Stripe's Dashboard: the version number
  // already decides which one her list shows.
  await stripe.promotionCodes
    .update(old.id, { metadata: { [META.replacedBy]: replacement.id } })
    .catch((error) => console.error(`Could not note that ${replacement.id} replaced ${old.id}:`, error));
  return viewOf(replacement);
}

/** Switches a code off and notes the deletion, which takes it off her list. Stripe keeps it, off. */
export async function deletePromotionCode(id: string): Promise<void> {
  const code = await retrieve(id);
  if (code.metadata?.[META.replacedBy]) throw new CodeRefusal("stale", 409);
  if (code.metadata?.[META.deletedAt]) return;
  await getStripe().promotionCodes.update(id, {
    active: false,
    metadata: { [META.deletedAt]: String(nowSeconds()), [META.wasActive]: String(code.active) },
  });
}

/**
 * Undo: a deleted code back on her list, switched on again if it was on.
 * Stripe will not switch on a code past its last day, out of uses, or whose
 * word another live code took in the meantime; it then comes back off.
 */
export async function restorePromotionCode(id: string): Promise<PromotionCodeView> {
  const stripe = getStripe();
  const code = await retrieve(id);
  if (!code.metadata?.[META.deletedAt]) return viewOf(code);
  const clear = { [META.deletedAt]: "", [META.wasActive]: "" };
  if (code.metadata[META.wasActive] === "true") {
    try {
      return viewOf(await stripe.promotionCodes.update(id, { active: true, metadata: clear, expand: EXPAND }));
    } catch (error) {
      console.error(`Promotion code ${id} came back switched off:`, error);
    }
  }
  return viewOf(await stripe.promotionCodes.update(id, { metadata: clear, expand: EXPAND }));
}

/** Switches a code on or off. One that has expired or run out of uses needs an edit instead. */
export async function setPromotionCodeActive(id: string, active: boolean): Promise<PromotionCodeView> {
  const code = await retrieve(id);
  assertCurrent(code);
  if (active) {
    const status = codeStatus(viewOf(code), Date.now());
    if (status === "expired" || status === "used_up") throw new CodeRefusal("not_usable", 409);
    await clearWord(code.code.toUpperCase(), code.id);
  }
  return viewOf(await getStripe().promotionCodes.update(id, { active, expand: EXPAND }));
}

/**
 * Records which codes each sent announcement carried, for the ones not yet
 * looked at: `only` one, straight after it is sent, or every one, when the
 * codes screen opens. A code counts only if it already existed when the
 * announcement went out, so a code made later with a word an old
 * announcement happened to use was never "sent".
 */
export async function recordAnnouncementCodes(
  service: Service,
  { only, codes }: { only?: string; codes?: Stripe.PromotionCode[] } = {}
): Promise<void> {
  let query = service
    .from("announcements")
    .select("id, subject_ro, subject_en, body_ro, body_en, sent_at, send_started_at")
    .is("codes_checked_at", null)
    .in("status", ["sent", "sending"]);
  if (only) query = query.eq("id", only);
  const { data: waiting, error } = await query;
  if (error) throw error;
  if (!waiting?.length) return;

  const all = codes ?? (await everyCode());
  for (const announcement of waiting) {
    const sentAt = Date.parse(announcement.sent_at ?? announcement.send_started_at ?? new Date().toISOString()) / 1000;
    const carried = codesCarried(
      announcement,
      all.filter((code) => code.created <= sentAt).map((code) => code.code)
    );
    if (carried.length) {
      const { error: insertError } = await service
        .from("announcement_codes")
        .upsert(carried.map((code) => ({ announcement_id: announcement.id, ...code })), { onConflict: "announcement_id,code" });
      if (insertError) throw insertError;
    }
    const { error: markError } = await service
      .from("announcements")
      .update({ codes_checked_at: new Date().toISOString() })
      .eq("id", announcement.id);
    if (markError) throw markError;
  }
}

/** For each code, how many people an announcement carried its word to since the word was given. */
export async function sentCounts(service: Service, codes: PromotionCodeView[]): Promise<Map<string, number>> {
  const words = [...new Set(codes.map((code) => code.code.toUpperCase()))];
  const counts = new Map<string, number>();
  if (!words.length) return counts;
  const { data, error } = await service.from("admin_code_recipients").select("code, email, sent_at").in("code", words);
  if (error) throw error;
  for (const code of codes) {
    const since = Date.parse(code.wordSince);
    const people = new Set(
      (data ?? [])
        .filter((row) => row.code === code.code.toUpperCase() && row.sent_at && Date.parse(row.sent_at) >= since)
        .map((row) => row.email)
    );
    counts.set(code.id, people.size);
  }
  return counts;
}
