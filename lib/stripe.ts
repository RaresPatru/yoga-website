import Stripe from "stripe";
import { usesLocalDatabase } from "@/lib/local-database";

let stripeInstance: Stripe | null = null;

/**
 * Where the test suite's stand-in for Stripe listens (tests/fake-stripe.ts),
 * named by STRIPE_API_BASE ("http://127.0.0.1:12111").
 *
 * Honoured only against the local database and with a test key, so no
 * setting on a deployment can send a payment anywhere but Stripe: a
 * production run with this variable set talks to Stripe as if it were not
 * there.
 */
function testServer(key: string): Partial<Stripe.StripeConfig> {
  const base = process.env.STRIPE_API_BASE;
  if (!base || !usesLocalDatabase() || !key.startsWith("sk_test_")) return {};
  const url = new URL(base);
  return {
    host: url.hostname,
    port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
    protocol: url.protocol === "https:" ? "https" : "http",
  };
}

export function getStripe() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY!;
    stripeInstance = new Stripe(key, { typescript: true, ...testServer(key) });
  }
  return stripeInstance;
}
