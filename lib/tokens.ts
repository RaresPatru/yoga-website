import { createHash, randomBytes } from "node:crypto";

/**
 * The random tokens in personal links (writing a testimonial, unsubscribing)
 * and how they are stored. Server only.
 *
 * The link carries 32 random bytes; the database keeps only their SHA-256.
 * Whoever holds the link can use it, and a copy of the database hands out no
 * working links.
 */

/** A new token for a link: 43 characters, safe in an address. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores for a token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Whether something in an address could be one of our tokens at all. */
export function plausibleToken(token: string | null | undefined): token is string {
  return typeof token === "string" && token.length >= 20 && token.length <= 100;
}
