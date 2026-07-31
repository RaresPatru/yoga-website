const buckets = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;

export function rateLimit(key: string, limit: number, windowMs: number = WINDOW_MS): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
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
