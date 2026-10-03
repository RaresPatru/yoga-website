import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import Stripe from "stripe";

/**
 * A stand-in for Stripe, for the test suite.
 *
 * The suite's keys are placeholders (CI has no Stripe account, on purpose),
 * so every path that talks to Stripe used to stop at "Invalid API Key": the
 * paid booking, the claim of a paid seat, refunds. That left the money path
 * the least tested part of the site (audit T1, T2). This server answers the
 * calls the site makes, keeps what it creates in memory, and behaves like
 * Stripe where the site depends on it:
 *
 *   - Checkout sessions: created, retrieved, listed by payment, expired (an
 *     expired one cannot be paid, a paid one cannot be expired).
 *   - A payment page at each session's `url`, with "Plătește" and the back
 *     link, which sends the signed webhooks Stripe would and then the visitor
 *     to success_url or cancel_url, with {CHECKOUT_SESSION_ID} written in.
 *   - Refunds: full only, refused for a payment already refunded
 *     (charge_already_refunded), with idempotency keys honoured, and
 *     charge.refunded sent.
 *   - Coupons and promotion codes, applied on the payment page.
 *
 * The site reaches it because playwright.config.ts starts the server with
 * STRIPE_API_BASE pointing here, which lib/stripe.ts honours only against a
 * local database and a test key. Tests steer it through /__control and read
 * what the site asked for from /__calls (tests/stripe-helpers.ts).
 *
 * Webhooks are signed with the suite's STRIPE_WEBHOOK_SECRET, so the site's
 * signature check runs exactly as in production.
 */

export const FAKE_STRIPE_PORT = 12111;
export const FAKE_STRIPE_URL = `http://127.0.0.1:${FAKE_STRIPE_PORT}`;

type Json = Record<string, unknown>;

interface Session {
  id: string;
  object: "checkout.session";
  status: "open" | "complete" | "expired";
  payment_status: "unpaid" | "paid" | "no_payment_required";
  url: string | null;
  expires_at: number;
  created: number;
  locale: string | null;
  currency: string;
  amount_subtotal: number;
  amount_total: number;
  total_details: { amount_discount: number; amount_shipping: number; amount_tax: number };
  discounts: { coupon: string | null; promotion_code: string | null }[];
  payment_intent: string | null;
  payment_method_types: string[];
  allow_promotion_codes: boolean;
  metadata: Record<string, string>;
  client_reference_id: string | null;
  customer_email: string | null;
  customer_details: { email: string | null; name: string | null } | null;
  success_url: string;
  cancel_url: string;
  line_items_name: string;
  /** Everything the site sent, as the test sees it. */
  params: Json;
}

interface Refund {
  id: string;
  object: "refund";
  amount: number;
  currency: string;
  payment_intent: string;
  charge: string;
  status: "succeeded" | "pending" | "failed";
  reason: string | null;
  metadata: Record<string, string>;
  created: number;
  failure_reason?: string | null;
}

interface Coupon {
  id: string;
  object: "coupon";
  name: string | null;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  duration: string;
  valid: boolean;
}

interface PromotionCode {
  id: string;
  object: "promotion_code";
  code: string;
  active: boolean;
  promotion: { type: "coupon"; coupon: string };
  max_redemptions: number | null;
  expires_at: number | null;
  times_redeemed: number;
  created: number;
  restrictions: Json;
}

export interface Call {
  method: string;
  path: string;
  params: Json;
  idempotencyKey: string | null;
}

const state = {
  sessions: new Map<string, Session>(),
  refunds: new Map<string, Refund>(),
  coupons: new Map<string, Coupon>(),
  promotionCodes: new Map<string, PromotionCode>(),
  idempotent: new Map<string, { status: number; body: unknown }>(),
  calls: [] as Call[],
  counter: 0,
  /** Send webhooks when something happens. Off: the site has to find out on the page the visitor returns to. */
  webhooks: true,
  /** Refuse every refund, as Stripe does when it cannot make one. */
  failRefunds: false,
};

function reset() {
  state.sessions.clear();
  state.refunds.clear();
  state.coupons.clear();
  state.promotionCodes.clear();
  state.idempotent.clear();
  state.calls = [];
  state.webhooks = true;
  state.failRefunds = false;
}

function nextId(prefix: string): string {
  state.counter += 1;
  // Shaped like Stripe's: the prefix, then letters and digits (a session's
  // id in test mode starts cs_test_), which the site's routes check for.
  const body = `fake${String(state.counter).padStart(6, "0")}${Math.random().toString(36).slice(2, 10)}`;
  return prefix === "cs" ? `cs_test_${body}` : `${prefix}_${body}`;
}

const now = () => Math.floor(Date.now() / 1000);

/**
 * Stripe's form encoding (`line_items[0][price_data][currency]=ron`) read back
 * into nested objects and arrays.
 */
function parseForm(text: string): Json {
  const out: Json = {};
  for (const [rawKey, value] of new URLSearchParams(text)) {
    const parts = rawKey.replace(/\]/g, "").split("[");
    let node: Record<string, unknown> | unknown[] = out;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      const key: string | number = Array.isArray(node) ? (part === "" ? node.length : Number(part)) : part;
      if (last) {
        (node as Record<string | number, unknown>)[key] = value;
        return;
      }
      const nextIsIndex = /^\d*$/.test(parts[i + 1]);
      const holder = node as Record<string | number, unknown>;
      if (holder[key] === undefined) holder[key] = nextIsIndex ? [] : {};
      node = holder[key] as Record<string, unknown> | unknown[];
    });
  }
  return out;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Request-Id": nextId("req") });
  res.end(JSON.stringify(body));
}

function stripeError(res: ServerResponse, status: number, code: string, message: string) {
  send(res, status, { error: { type: "invalid_request_error", code, message } });
}

const list = (data: unknown[], url: string) => ({ object: "list", data, has_more: false, url });

/** What the site would read back about a session, with the code expanded when asked. */
function sessionView(session: Session, expand: string[] = []): Json {
  const view: Json = { ...session };
  delete view.params;
  delete view.line_items_name;
  if (expand.includes("discounts.promotion_code")) {
    view.discounts = session.discounts.map((d) => ({
      ...d,
      promotion_code: d.promotion_code ? state.promotionCodes.get(d.promotion_code) ?? d.promotion_code : null,
    }));
  }
  return view;
}

function promotionView(code: PromotionCode, expand: string[] = []): Json {
  const coupon = state.coupons.get(code.promotion.coupon);
  return {
    ...code,
    promotion: {
      type: "coupon",
      coupon: expand.some((e) => e.endsWith("promotion.coupon")) ? coupon ?? code.promotion.coupon : code.promotion.coupon,
    },
  };
}

function expandList(params: Json): string[] {
  const expand = params.expand;
  return Array.isArray(expand) ? (expand as string[]) : typeof expand === "string" ? [expand] : [];
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

function webhookUrl(): string {
  return process.env.FAKE_STRIPE_WEBHOOK_URL ?? "http://localhost:3100/api/stripe/webhook";
}

/** Signs an event with the suite's secret, as Stripe signs it with the endpoint's. */
export function signedEvent(type: string, object: unknown): { payload: string; signature: string } {
  const payload = JSON.stringify({
    id: nextId("evt"),
    object: "event",
    api_version: "2026-06-24.dahlia",
    created: now(),
    type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  });
  const signature = signer.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_placeholder",
  });
  return { payload, signature };
}

/** Only for signing: an instance with a key nothing ever sends anywhere. */
const signer = new Stripe("sk_test_signing_only").webhooks;

async function deliver(type: string, object: unknown): Promise<void> {
  if (!state.webhooks) return;
  const { payload, signature } = signedEvent(type, object);
  try {
    // Awaited, as Stripe waits up to ten seconds for checkout.session.completed
    // before sending the visitor on.
    await fetch(webhookUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error(`[fake-stripe] ${type} webhook was not delivered:`, error);
  }
}

// ---------------------------------------------------------------------------
// The API the site calls
// ---------------------------------------------------------------------------

function createSession(params: Json): Session {
  const id = nextId("cs");
  const item = ((params.line_items as Json[]) ?? [])[0] ?? {};
  const priceData = (item.price_data ?? {}) as Json;
  const amount = Number(priceData.unit_amount ?? 0) * Number(item.quantity ?? 1);
  const session: Session = {
    id,
    object: "checkout.session",
    status: "open",
    payment_status: "unpaid",
    url: `${FAKE_STRIPE_URL}/pay/${id}`,
    expires_at: Number(params.expires_at ?? now() + 24 * 3600),
    created: now(),
    locale: (params.locale as string) ?? null,
    currency: String(priceData.currency ?? "ron"),
    amount_subtotal: amount,
    amount_total: amount,
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
    discounts: [],
    payment_intent: null,
    payment_method_types: (params.payment_method_types as string[]) ?? ["card"],
    allow_promotion_codes: params.allow_promotion_codes === "true",
    metadata: (params.metadata as Record<string, string>) ?? {},
    client_reference_id: (params.client_reference_id as string) ?? null,
    customer_email: (params.customer_email as string) ?? null,
    customer_details: null,
    success_url: String(params.success_url ?? ""),
    cancel_url: String(params.cancel_url ?? ""),
    line_items_name: String(((priceData.product_data ?? {}) as Json).name ?? ""),
    params,
  };
  state.sessions.set(id, session);
  return session;
}

/** Pays a session: the visitor pressed Plătește. A promotion code, when given and valid, comes off first. */
export async function paySession(session: Session, code?: string | null): Promise<Session> {
  if (session.status !== "open") return session;
  if (code && session.allow_promotion_codes) {
    const promo = [...state.promotionCodes.values()].find((p) => p.active && p.code.toLowerCase() === code.toLowerCase());
    const coupon = promo ? state.coupons.get(promo.promotion.coupon) : null;
    if (promo && coupon) {
      const off = coupon.percent_off
        ? Math.round((session.amount_subtotal * coupon.percent_off) / 100)
        : coupon.currency === session.currency
          ? Math.min(coupon.amount_off ?? 0, session.amount_subtotal)
          : 0;
      if (off > 0) {
        session.total_details.amount_discount = off;
        session.amount_total = session.amount_subtotal - off;
        session.discounts = [{ coupon: coupon.id, promotion_code: promo.id }];
        promo.times_redeemed += 1;
      }
    }
  }
  session.status = "complete";
  session.payment_status = session.amount_total === 0 ? "no_payment_required" : "paid";
  session.payment_intent = session.amount_total === 0 ? null : nextId("pi");
  session.customer_details = { email: session.customer_email, name: "Fake Payer" };
  await deliver("checkout.session.completed", sessionView(session));
  return session;
}

async function expireSession(session: Session): Promise<void> {
  session.status = "expired";
  session.url = null;
  await deliver("checkout.session.expired", sessionView(session));
}

function chargeFor(paymentIntent: string, session: Session, refunded: number): Json {
  return {
    id: `ch_${paymentIntent.slice(3)}`,
    object: "charge",
    amount: session.amount_total,
    amount_captured: session.amount_total,
    amount_refunded: refunded,
    currency: session.currency,
    payment_intent: paymentIntent,
    refunded: refunded >= session.amount_total,
    metadata: session.metadata,
  };
}

/** The refunds made so far against a payment, in total. */
function refundedOn(paymentIntent: string): number {
  return [...state.refunds.values()]
    .filter((r) => r.payment_intent === paymentIntent && r.status !== "failed")
    .reduce((sum, r) => sum + r.amount, 0);
}

/** Refunds a payment from the test, as she would in her Stripe Dashboard: `amount` short of the total is a partial refund. */
export async function refundFromDashboard(paymentIntent: string, amount?: number): Promise<Refund | null> {
  const session = [...state.sessions.values()].find((s) => s.payment_intent === paymentIntent);
  if (!session) return null;
  const refund: Refund = {
    id: nextId("re"),
    object: "refund",
    amount: amount ?? session.amount_total - refundedOn(paymentIntent),
    currency: session.currency,
    payment_intent: paymentIntent,
    charge: `ch_${paymentIntent.slice(3)}`,
    status: "succeeded",
    reason: null,
    metadata: {},
    created: now(),
  };
  state.refunds.set(refund.id, refund);
  await deliver("charge.refunded", chargeFor(paymentIntent, session, refundedOn(paymentIntent)));
  return refund;
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL, params: Json) {
  const path = url.pathname;
  const method = req.method ?? "GET";
  const idempotencyKey = (req.headers["idempotency-key"] as string | undefined) ?? null;
  state.calls.push({ method, path, params, idempotencyKey });

  if (idempotencyKey && method === "POST") {
    const seen = state.idempotent.get(idempotencyKey);
    if (seen) return send(res, seen.status, seen.body);
  }
  const remember = (status: number, body: unknown) => {
    if (idempotencyKey && method === "POST") state.idempotent.set(idempotencyKey, { status, body });
    send(res, status, body);
  };

  let match: RegExpMatchArray | null;

  if (method === "POST" && path === "/v1/checkout/sessions") {
    return remember(200, sessionView(createSession(params)));
  }
  if (method === "GET" && path === "/v1/checkout/sessions") {
    const pi = params.payment_intent as string | undefined;
    const found = [...state.sessions.values()].filter((s) => !pi || s.payment_intent === pi);
    return send(res, 200, list(found.map((s) => sessionView(s)), path));
  }
  if ((match = path.match(/^\/v1\/checkout\/sessions\/([^/]+)$/)) && method === "GET") {
    const session = state.sessions.get(match[1]);
    if (!session) return stripeError(res, 404, "resource_missing", `No such checkout.session: '${match[1]}'`);
    return send(res, 200, sessionView(session, expandList(params)));
  }
  if ((match = path.match(/^\/v1\/checkout\/sessions\/([^/]+)\/expire$/)) && method === "POST") {
    const session = state.sessions.get(match[1]);
    if (!session) return stripeError(res, 404, "resource_missing", `No such checkout.session: '${match[1]}'`);
    if (session.status !== "open") {
      return stripeError(res, 400, "checkout_session_not_open", `This Checkout Session is ${session.status} and cannot be expired.`);
    }
    await expireSession(session);
    return remember(200, sessionView(session));
  }

  if (method === "POST" && path === "/v1/refunds") {
    const pi = String(params.payment_intent ?? "");
    const session = [...state.sessions.values()].find((s) => s.payment_intent === pi);
    if (!session) return stripeError(res, 404, "resource_missing", `No such payment_intent: '${pi}'`);
    if (state.failRefunds) return remember(402, { error: { type: "card_error", code: "refund_disputed_payment", message: "Stripe could not refund this payment." } });
    const left = session.amount_total - refundedOn(pi);
    if (left <= 0) return remember(400, { error: { type: "invalid_request_error", code: "charge_already_refunded", message: "Charge has already been refunded." } });
    const amount = params.amount !== undefined ? Number(params.amount) : left;
    const refund: Refund = {
      id: nextId("re"),
      object: "refund",
      amount,
      currency: session.currency,
      payment_intent: pi,
      charge: `ch_${pi.slice(3)}`,
      status: "succeeded",
      reason: (params.reason as string) ?? null,
      metadata: (params.metadata as Record<string, string>) ?? {},
      created: now(),
    };
    state.refunds.set(refund.id, refund);
    remember(200, refund);
    // After answering, as Stripe sends its events after the API call returns.
    void deliver("charge.refunded", chargeFor(pi, session, refundedOn(pi)));
    return;
  }

  if (method === "POST" && path === "/v1/coupons") {
    const coupon: Coupon = {
      id: nextId("co").slice(0, 20),
      object: "coupon",
      name: (params.name as string) ?? null,
      percent_off: params.percent_off !== undefined ? Number(params.percent_off) : null,
      amount_off: params.amount_off !== undefined ? Number(params.amount_off) : null,
      currency: (params.currency as string) ?? null,
      duration: String(params.duration ?? "once"),
      valid: true,
    };
    state.coupons.set(coupon.id, coupon);
    return remember(200, coupon);
  }
  if (method === "GET" && path === "/v1/promotion_codes") {
    let codes = [...state.promotionCodes.values()].sort((a, b) => b.created - a.created);
    if (params.code) codes = codes.filter((c) => c.code.toLowerCase() === String(params.code).toLowerCase());
    if (params.active !== undefined) codes = codes.filter((c) => String(c.active) === String(params.active));
    return send(res, 200, list(codes.map((c) => promotionView(c, expandList(params))), path));
  }
  if (method === "POST" && path === "/v1/promotion_codes") {
    const promotion = (params.promotion ?? {}) as Json;
    const coupon = state.coupons.get(String(promotion.coupon ?? ""));
    if (!coupon) return stripeError(res, 400, "resource_missing", "No such coupon");
    const code: PromotionCode = {
      id: nextId("promo"),
      object: "promotion_code",
      code: String(params.code ?? ""),
      active: true,
      promotion: { type: "coupon", coupon: coupon.id },
      max_redemptions: params.max_redemptions !== undefined ? Number(params.max_redemptions) : null,
      expires_at: params.expires_at !== undefined ? Number(params.expires_at) : null,
      times_redeemed: 0,
      created: now() + state.counter,
      restrictions: {},
    };
    state.promotionCodes.set(code.id, code);
    return remember(200, promotionView(code, expandList(params)));
  }
  if ((match = path.match(/^\/v1\/promotion_codes\/([^/]+)$/)) && method === "POST") {
    const code = state.promotionCodes.get(match[1]);
    if (!code) return stripeError(res, 404, "resource_missing", `No such promotion code: '${match[1]}'`);
    if (params.active !== undefined) code.active = params.active === "true";
    return remember(200, promotionView(code, expandList(params)));
  }

  return stripeError(res, 404, "unknown_endpoint", `The fake Stripe does not know ${method} ${path}`);
}

// ---------------------------------------------------------------------------
// The payment page a visitor is sent to
// ---------------------------------------------------------------------------

const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function payPage(session: Session): string {
  const back = session.cancel_url.replace("{CHECKOUT_SESSION_ID}", session.id);
  const total = (session.amount_total / 100).toFixed(2);
  const body =
    session.status === "open"
      ? `<form method="post" action="/pay/${session.id}">
           ${session.allow_promotion_codes ? `<label>Cod promoțional <input name="code" autocomplete="off"></label>` : ""}
           <button type="submit">Plătește</button>
         </form>`
      : `<p>Sesiunea este ${session.status}.</p>`;
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Fake Stripe</title></head>
    <body><a href="${html(back)}">Înapoi</a>
    <h1>${html(session.line_items_name)}</h1>
    <p data-total>${total} ${session.currency.toUpperCase()}</p>
    <p data-methods>${session.payment_method_types.join(",")}</p>
    ${body}</body></html>`;
}

async function handlePage(req: IncomingMessage, res: ServerResponse, url: URL, params: Json) {
  const match = url.pathname.match(/^\/pay\/([^/]+)$/);
  const session = match ? state.sessions.get(match[1]) : undefined;
  if (!session) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("No such session");
  }
  if (req.method === "POST") {
    await paySession(session, (params.code as string) || null);
    res.writeHead(303, { Location: session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id) });
    return res.end();
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(payPage(session));
}

// ---------------------------------------------------------------------------
// What the tests steer it with
// ---------------------------------------------------------------------------

async function handleControl(req: IncomingMessage, res: ServerResponse, url: URL, params: Json) {
  const path = url.pathname;
  if (path === "/__control" && req.method === "POST") {
    if (params.reset) reset();
    if (typeof params.webhooks === "boolean") state.webhooks = params.webhooks;
    if (typeof params.failRefunds === "boolean") state.failRefunds = params.failRefunds;
    return send(res, 200, { webhooks: state.webhooks, failRefunds: state.failRefunds });
  }
  if (path === "/__calls") return send(res, 200, state.calls);
  if (path === "/__sessions") {
    return send(res, 200, [...state.sessions.values()].map((s) => ({ ...sessionView(s), params: s.params })));
  }
  if (path === "/__refunds") return send(res, 200, [...state.refunds.values()]);
  let match: RegExpMatchArray | null;
  if ((match = path.match(/^\/__sessions\/([^/]+)\/pay$/)) && req.method === "POST") {
    const session = state.sessions.get(match[1]);
    if (!session) return send(res, 404, { error: "No such session" });
    const webhooks = state.webhooks;
    if (params.webhook === false) state.webhooks = false;
    await paySession(session, (params.code as string) ?? null);
    state.webhooks = webhooks;
    return send(res, 200, sessionView(session));
  }
  if ((match = path.match(/^\/__sessions\/([^/]+)\/expire$/)) && req.method === "POST") {
    const session = state.sessions.get(match[1]);
    if (!session) return send(res, 404, { error: "No such session" });
    const webhooks = state.webhooks;
    if (params.webhook === false) state.webhooks = false;
    if (session.status === "open") await expireSession(session);
    state.webhooks = webhooks;
    return send(res, 200, sessionView(session));
  }
  if ((match = path.match(/^\/__payments\/([^/]+)\/refund$/)) && req.method === "POST") {
    const refund = await refundFromDashboard(match[1], typeof params.amount === "number" ? params.amount : undefined);
    return refund ? send(res, 200, refund) : send(res, 404, { error: "No such payment" });
  }
  if ((match = path.match(/^\/__refunds\/([^/]+)\/fail$/)) && req.method === "POST") {
    const refund = state.refunds.get(match[1]);
    if (!refund) return send(res, 404, { error: "No such refund" });
    refund.status = "failed";
    refund.failure_reason = "lost_or_stolen_card";
    await deliver("refund.failed", refund);
    return send(res, 200, refund);
  }
  return send(res, 404, { error: "Unknown control" });
}

export function startFakeStripe(): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", FAKE_STRIPE_URL);
      const text = req.method === "GET" ? url.search.slice(1) : await readBody(req);
      const json = (req.headers["content-type"] ?? "").includes("application/json");
      const params = json ? (JSON.parse(text || "{}") as Json) : parseForm(text);
      if (url.pathname.startsWith("/v1/")) return await handleApi(req, res, url, params);
      if (url.pathname.startsWith("/pay/")) return await handlePage(req, res, url, params);
      return await handleControl(req, res, url, params);
    } catch (error) {
      console.error("[fake-stripe] failed:", error);
      send(res, 500, { error: { type: "api_error", message: String(error) } });
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAKE_STRIPE_PORT, "127.0.0.1", () => resolve(server));
  });
}
