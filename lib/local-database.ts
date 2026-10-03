/**
 * Which database this run of the site reads, and what follows from it.
 *
 * The address of the database is what makes the data real or not: `npm run
 * dev` and the test suite use the local stack (`npx supabase start`), while
 * `npm run dev:prod` and every deployment use production. So environment
 * behaviour is gated on it rather than on NODE_ENV, which says `production`
 * in any production build, including one pointed at the local stack
 * (CLAUDE.md).
 */

const LOCAL_DATABASE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;

/** Whether this run reads the local database rather than production. */
export function usesLocalDatabase(): boolean {
  return LOCAL_DATABASE.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}

/**
 * A short name for this run's database: "local", or the host of the
 * production one ("abcd1234.supabase.co").
 *
 * Every Stripe Checkout session carries it (lib/stripe-checkout.ts). The
 * Stripe sandbox is one account shared by every copy of the site: a local
 * run, the test suite and production all create sessions in it, and Stripe
 * sends each session's events to every webhook listening. A webhook acts only
 * on sessions its own database created, so a payment made on a laptop is
 * never looked for, or refunded as unknown, by production.
 */
export function databaseTag(): string {
  if (usesLocalDatabase()) return "local";
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host || "unknown";
  } catch {
    return "unknown";
  }
}
