/**
 * Verifies a Cloudflare Turnstile CAPTCHA token with Cloudflare's servers.
 *
 * How Turnstile works, briefly: the widget in the browser hands the visitor a
 * short-lived token once it is satisfied they are human. The browser sends that
 * token along with the form. It proves nothing on its own — anyone can invent a
 * string — so the server has to ask Cloudflare "did you issue this, and is it
 * still valid?". That question is what this function asks. Tokens are
 * single-use and expire after a few minutes.
 *
 * FAILING CLOSED
 *
 * The previous version began with `if (!secret) return true`, meaning a missing
 * TURNSTILE_SECRET_KEY made every CAPTCHA check pass. A single mistyped or
 * forgotten environment variable in Vercel would have silently disabled bot
 * protection across registrations, the waiting list, the contact form and
 * testimonials — with no error, no log line, and a widget still spinning
 * reassuringly on the page.
 *
 * This is the difference between failing open and failing closed. When a
 * security check cannot run, the safe answer is "no", not "yes". The cost of
 * being wrong in each direction is not symmetrical: refusing a real person
 * produces a support message, while admitting every bot produces a spammed
 * database and wasted Resend quota.
 *
 * The one exception is local development, where nobody wants to configure
 * Cloudflare to test a form. That path is explicit, loud, and impossible to
 * enable by accident in production.
 */
export async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    const bypassAllowed =
      process.env.NODE_ENV !== "production" &&
      process.env.TURNSTILE_DEV_BYPASS === "true";

    if (bypassAllowed) {
      console.warn(
        "[turnstile] TURNSTILE_DEV_BYPASS is on — CAPTCHA is NOT being verified. Development only."
      );
      return true;
    }

    console.error(
      "[turnstile] TURNSTILE_SECRET_KEY is not set. Rejecting the request. " +
        "Set the key, or set TURNSTILE_DEV_BYPASS=true for local development."
    );
    return false;
  }

  if (!token || typeof token !== "string") return false;

  try {
    const body = new URLSearchParams();
    body.append("secret", secret);
    body.append("response", token);

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body,
        // Cloudflare is normally fast. If it is not, we would rather reject the
        // submission than leave the request hanging until the serverless
        // function times out.
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!res.ok) {
      console.error(`[turnstile] siteverify returned HTTP ${res.status}`);
      return false;
    }

    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    if (data.success !== true) {
      // Cloudflare's codes are genuinely useful when debugging: for example
      // 'timeout-or-duplicate' means the token was already used, which usually
      // points at a form being submitted twice rather than at an attack.
      console.warn(
        `[turnstile] verification failed: ${data["error-codes"]?.join(", ") || "unknown"}`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("[turnstile] verification error:", error);
    return false;
  }
}
