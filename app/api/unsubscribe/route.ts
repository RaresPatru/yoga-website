import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { unsubscribe } from "@/lib/announcements";

/**
 * Unsubscribing from announcements, two ways:
 *
 *   - One click from the mail app (RFC 8058). Every announcement carries
 *     `List-Unsubscribe: <…/api/unsubscribe?token=…>` and
 *     `List-Unsubscribe-Post: List-Unsubscribe=One-Click`; Gmail and Apple
 *     Mail show their own Unsubscribe button and POST here, with nobody
 *     opening a page. The answer is a plain 200.
 *   - The link in the email's footer opens /[locale]/unsubscribe, whose one
 *     button posts the form here (`from=page`). The answer is a redirect back
 *     to that page, saying it is done, so it works with no JavaScript at all.
 *
 * Only POST changes anything. Mail scanners follow every link in an email
 * with GET to check it, and a GET that unsubscribed would unsubscribe people
 * who never pressed anything.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token");
  let fromPage = false;
  let locale: "ro" | "en" = "ro";

  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const field = form?.get("token");
    if (!token && typeof field === "string") token = field;
    fromPage = form?.get("from") === "page";
    locale = form?.get("locale") === "en" ? "en" : "ro";
  }

  const back = (state: "done" | "invalid") =>
    NextResponse.redirect(new URL(`/${locale}/unsubscribe?${state}=1`, url), 303);

  if (!rateLimit(`unsubscribe:${clientIp(request)}`, 30)) {
    return fromPage ? back("invalid") : NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  try {
    const done = await unsubscribe(token);
    if (fromPage) return back(done ? "done" : "invalid");
    return done ? new NextResponse(null, { status: 200 }) : NextResponse.json({ error: "Unknown link" }, { status: 404 });
  } catch (error) {
    console.error("Unsubscribe failed:", error);
    return fromPage ? back("invalid") : NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
