import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/lib/cron";
import { sendDueReviewInvitations } from "@/lib/reviews";

/**
 * The daily job, run by Vercel once a day (vercel.json) and by nothing else.
 *
 * All the work is one database function, daily_cleanup() in
 * supabase/migrations/20260928000000_participants.sql, so it happens in one
 * transaction and can be read in one place:
 *
 *   - participants' notes, and her notes about them, are cleared 30 days
 *     after their event, as the booking form promises;
 *   - checkouts nobody finished are deleted after a week;
 *   - lapsed links to write a testimonial are deleted.
 *
 * Then, the morning after an event, the people who came are sent a link to
 * write a testimonial (lib/reviews.ts), unless she has turned that off.
 *
 * Answers with how many rows each step touched, which is what Vercel's cron
 * log shows her.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await createAdminClient().rpc("daily_cleanup");
  if (error) {
    console.error("Daily clean-up failed:", error);
    return NextResponse.json({ error: "Clean-up failed" }, { status: 500 });
  }

  let reviews: Awaited<ReturnType<typeof sendDueReviewInvitations>> | { error: string };
  try {
    reviews = await sendDueReviewInvitations();
  } catch (failure) {
    console.error("Review invitations failed:", failure);
    reviews = { error: "Review invitations failed" };
  }
  return NextResponse.json({ ...(data as object), review_invitations: reviews });
}
