import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { sanitizeReviewHtml } from "@/lib/sanitize";
import { toPlainText } from "@/lib/plain-text";
import { embedFromUrl } from "@/lib/embeds";
import { deleteReviewPhoto, storeReviewPhoto } from "@/lib/review-photo";
import { REVIEW_TEXT_MAX, REVIEW_TEXT_MIN, displayNames, openInvitation } from "@/lib/reviews";

/**
 * A testimonial, written through a personal link (/testimonials/write).
 *
 * The link's token is the only credential: it was emailed to the address the
 * booking was made with, so whoever holds it is taken to be that participant.
 * Everything else is checked here, whatever the form did:
 *
 *   - the link still works (lib/reviews.ts, openInvitation);
 *   - a rating from 1 to 5 and consent to publish;
 *   - the text, through the strict sanitizer (paragraphs, bold, italics) and
 *     then counted as text, 10 to 2,000 characters;
 *   - the name shown is one of the two made from the booking's own name, so
 *     nobody can publish under someone else's;
 *   - a video link only from the players the site can show;
 *   - a photo, re-saved as WebP without its metadata (lib/review-photo.ts).
 *
 * The link is marked used before the testimonial is stored, in one
 * conditional update, so two presses of Send cannot store two. If storing
 * then fails, the link is released again and any photo removed.
 *
 * It arrives unapproved: nothing is published until she approves it.
 */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`reviews:${clientIp(req)}`, 10)) {
      return NextResponse.json({ error: "Too many attempts", code: "rate" }, { status: 429 });
    }

    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid form", code: "invalid" }, { status: 400 });

    const opened = await openInvitation(String(form.get("token") ?? ""));
    if (!opened.ok) return NextResponse.json({ error: "Link refused", code: opened.reason }, { status: 410 });
    const { invitation } = opened;

    const rating = Number(form.get("rating"));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating 1-5", code: "rating" }, { status: 400 });
    }
    if (form.get("consent") !== "true") {
      return NextResponse.json({ error: "Consent required", code: "consent" }, { status: 400 });
    }

    const content = sanitizeReviewHtml(String(form.get("content") ?? ""));
    const length = toPlainText(content).length;
    if (length < REVIEW_TEXT_MIN || length > REVIEW_TEXT_MAX) {
      return NextResponse.json({ error: "Text length", code: "text" }, { status: 400 });
    }

    const names = displayNames(invitation.fullName);
    const authorName = form.get("name") === "full" ? names.full : names.short;

    const videoInput = String(form.get("video") ?? "").trim();
    let videoUrl: string | null = null;
    if (videoInput) {
      if ("refused" in embedFromUrl(videoInput)) {
        return NextResponse.json({ error: "Unsupported video", code: "video" }, { status: 400 });
      }
      videoUrl = videoInput.startsWith("http") ? videoInput : `https://${videoInput}`;
    }

    const photoFile = form.get("photo");
    let photo: { url: string; path: string } | null = null;
    if (photoFile instanceof File && photoFile.size > 0) {
      const stored = await storeReviewPhoto(photoFile);
      if (!stored.ok) return NextResponse.json({ error: "Photo refused", code: stored.reason }, { status: 400 });
      photo = stored;
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data: claimed, error: claimError } = await supabase
      .from("review_invitations")
      .update({ used_at: now })
      .eq("id", invitation.invitationId)
      .is("used_at", null)
      .select("id");
    if (claimError) throw claimError;
    if (!claimed?.length) {
      if (photo) await deleteReviewPhoto(photo.path);
      return NextResponse.json({ error: "Link used", code: "used" }, { status: 410 });
    }

    const { error: insertError } = await supabase.from("testimonials").insert({
      event_id: invitation.event.id,
      registration_id: invitation.registrationId,
      type: "text",
      content,
      rating,
      author_name: authorName,
      video_url: videoUrl,
      photo_url: photo?.url ?? null,
      consent_at: now,
      locale: invitation.locale,
      source: "participant",
      approved: false,
    });
    if (insertError) {
      await supabase.from("review_invitations").update({ used_at: null }).eq("id", invitation.invitationId);
      if (photo) await deleteReviewPhoto(photo.path);
      // One testimonial per booking: a second, through another link, is refused.
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "Already written", code: "used" }, { status: 410 });
      }
      throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Testimonial submission failed:", error);
    return NextResponse.json({ error: "Internal server error", code: "server" }, { status: 500 });
  }
}
