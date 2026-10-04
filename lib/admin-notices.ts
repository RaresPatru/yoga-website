import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

/**
 * Notices for her dashboard about what happened on the site without her:
 * the `admin_notifications` table (supabase/migrations/20261003000000_payments.sql).
 * Server only: visitors and webhooks write them with the service key, and
 * she only reads them and marks them seen.
 *
 *   cancelled         a participant cancelled through the link in their
 *                     confirmation email, and what happened to the money
 *   refunded          a refund was made in Stripe's Dashboard
 *   refund_failed     Stripe could not return a refund
 *   payment_returned  the site refunded a payment that had no seat behind it
 */

export type NoticeKind = "cancelled" | "refunded" | "refund_failed" | "payment_returned";

/** What a cancellation did with the money. */
export type CancelRefund = "none" | "automatic" | "requested" | "failed";

export interface Notice {
  kind: NoticeKind;
  registrationId?: string | null;
  eventId?: string | null;
  details?: Record<string, Json | undefined>;
  /**
   * What it is about (a cancellation, a Stripe charge, refund or session). The
   * same thing reported twice, by the webhook and by the page a visitor came
   * back to, is recorded once.
   */
  sourceId: string;
}

/**
 * Records a notice, once per sourceId. A failure is logged, never thrown: the
 * thing it reports has already happened, and the notice is how she hears of
 * it, not what makes it so.
 */
export async function recordNotice(notice: Notice): Promise<void> {
  const { error } = await createAdminClient()
    .from("admin_notifications")
    .upsert(
      {
        kind: notice.kind,
        registration_id: notice.registrationId ?? null,
        event_id: notice.eventId ?? null,
        details: notice.details ?? {},
        source_id: notice.sourceId,
      },
      { onConflict: "source_id", ignoreDuplicates: true }
    );
  if (error) console.error(`Could not record the ${notice.kind} notice ${notice.sourceId}:`, error);
}
