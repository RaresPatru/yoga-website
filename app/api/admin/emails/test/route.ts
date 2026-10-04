import { NextResponse } from "next/server";
import { adminFromRequest } from "@/lib/is-admin";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-config";
import { emailLocale, isTemplateType } from "@/lib/email-content";
import { loadEmailSettings } from "@/lib/email-brand";
import { cardEventsFor, eventCardIds, loadCardEvents, loadSampleEvent, previewEmail } from "@/lib/email-preview";
import { sendEmail, senderOf } from "@/lib/email";

/**
 * "Trimite-mi un test": the email she is editing, as it stands on screen,
 * saved or not, sent to the address she signs in with. It is drawn by the
 * same code as the preview beside it and as the real email, with the same
 * sample data (the next event), and its subject starts with "[Test]".
 *
 * Only ever to her own address, never to one in the request: a route that
 * sent her layout to any address would be a way to send email in her name.
 */

const SUBJECT_MAX = 500;
const BODY_MAX = 100_000;

export async function POST(request: Request) {
  try {
    const admin = await adminFromRequest(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!admin.email) return NextResponse.json({ error: "No address", code: "no_address" }, { status: 409 });
    if (!rateLimit(`email-test:${admin.id}`, 10)) {
      return NextResponse.json({ error: "Too many tests", code: "rate_limited" }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const locale = emailLocale(body.locale);
    const subject = typeof body.subject === "string" ? body.subject.slice(0, SUBJECT_MAX) : "";
    const html = typeof body.body === "string" ? body.body.slice(0, BODY_MAX) : "";
    if (!subject.trim() || !html.trim()) {
      return NextResponse.json({ error: "Nothing to send", code: "empty" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const settings = await loadEmailSettings(supabase, siteUrl());

    let preview;
    if (body.kind === "announcement") {
      const cards = cardEventsFor(await loadCardEvents(supabase, eventCardIds(html)), locale, settings.brand.siteUrl);
      const name = typeof body.name === "string" ? body.name.slice(0, 200) : undefined;
      preview = previewEmail({ kind: "announcement", locale, subject, body: html, settings, cards, name });
    } else {
      if (typeof body.type !== "string" || !isTemplateType(body.type)) {
        return NextResponse.json({ error: "Unknown email", code: "invalid" }, { status: 400 });
      }
      const event = await loadSampleEvent(supabase);
      preview = previewEmail({ kind: "template", type: body.type, locale, subject, body: html, settings, event });
    }

    const result = await sendEmail(
      { to: admin.email, subject: `[Test] ${preview.subject}`, html: preview.html, text: preview.text },
      senderOf(settings)
    );
    if (!result.ok) {
      console.error("Test email failed:", result.error);
      return NextResponse.json({ error: "Not sent", code: "send_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, to: admin.email });
  } catch (error) {
    console.error("Test email failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
