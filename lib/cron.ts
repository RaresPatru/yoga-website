import { timingSafeEqual } from "node:crypto";

/**
 * Whether a request comes from Vercel's scheduler.
 *
 * Vercel calls the paths listed under "crons" in vercel.json with
 * `Authorization: Bearer <CRON_SECRET>`, the secret being an environment
 * variable set in the project. Anybody else can call the same address, so the
 * header is the only thing that makes it a scheduled run.
 *
 * Fails closed: with no secret configured, or one too short to be a secret,
 * nothing is a scheduled run, rather than everything. Compared in constant
 * time, so the answer's timing says nothing about how much of a guess was
 * right.
 */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
