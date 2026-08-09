/**
 * Fixed-window, per-IP rate limiting held in memory.
 *
 * A known limitation, stated plainly: on Vercel each serverless instance has
 * its own copy of this Map, so the limits are per-instance and reset whenever
 * an instance is recycled. That makes this a speed bump against casual abuse,
 * not a real defence against a determined attacker. Shared state (Vercel KV or
 * Upstash) is the upgrade path if abuse ever becomes real. It is still worth
 * having: combined with the CAPTCHA it stops the common case, which is a script
 * hammering a form.
 */
const buckets = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Scales every limit. Left at 1 everywhere except the automated tests.
 *
 * The tests need this because the limits are stateful and survive between runs
 * (the server keeps running), and every browser project shares 127.0.0.1 — so
 * a suite that submits the contact form a few times legitimately trips a
 * 5-per-10-minutes limit and then fails for the rest of the window. Raising the
 * ceiling in the test environment keeps production behaviour untouched while
 * letting the suite exercise the paths behind it.
 */
const LIMIT_MULTIPLIER = Math.max(1, Number(process.env.RATE_LIMIT_MULTIPLIER) || 1);

export function rateLimit(key: string, limit: number, windowMs: number = WINDOW_MS): boolean {
  const now = Date.now();
  const effectiveLimit = limit * LIMIT_MULTIPLIER;
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);

  if (hits.length >= effectiveLimit) {
    buckets.set(key, hits);
    return false;
  }

  hits.push(now);
  buckets.set(key, hits);

  if (buckets.size > 10_000) {
    for (const [k, arr] of buckets) {
      const latest = arr[arr.length - 1];
      if (!latest || now - latest > windowMs) buckets.delete(k);
    }
  }

  return true;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
