import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

async function notifyWaitingList(eventId: string, spotsOpened: number = 1) {
  const supabase = createAdminClient();

  const { data: nextBatch } = await supabase
    .from("waiting_list")
    .select("*")
    .eq("event_id", eventId)
    .is("claimed_at", null)
    .order("created_at", { ascending: true })
    .limit(spotsOpened);

  if (!nextBatch || nextBatch.length === 0) return;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  const { data: lastNotification } = await supabase
    .from("waiting_list_notifications")
    .select("batch_number")
    .eq("event_id", eventId)
    .order("batch_number", { ascending: false })
    .limit(1)
    .single();

  const batchNumber = (lastNotification?.batch_number || 0) + 1;

  const { data: notification } = await supabase
    .from("waiting_list_notifications")
    .insert({
      event_id: eventId,
      batch_number: batchNumber,
      expires_at: expiresAt.toISOString(),
      spots_opened: spotsOpened,
    })
    .select()
    .single();

  if (!notification) return;

  for (const entry of nextBatch) {
    const eventSlug = event?.slug || eventId;
    const claimUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/events/${eventSlug}?claim=${entry.id}`;

    try {
      const { data: template } = await supabase
        .from("email_templates")
        .select("*")
        .eq("type", "spot_available")
        .single();

      if (template) {
        const vars: Record<string, string> = {
          user_name: entry.full_name,
          event_name: event?.title_ro || "",
          claim_url: claimUrl,
          expires_at: expiresAt.toLocaleString("ro-RO"),
        };

        const subject = template.subject_ro.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] || "");
        const body = template.body_ro.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] || "");

        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY!);

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: entry.email,
          subject,
          html: body,
        });
      }
    } catch (emailError) {
      console.error("Waiting list notification email error:", emailError);
    }
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const body = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    const supabase = createAdminClient();

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const registrationId = session.metadata?.registrationId;

      if (registrationId) {
        await supabase
          .from("registrations")
          .update({ payment_status: "completed", stripe_session_id: session.id })
          .eq("id", registrationId);
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as any;
      const registrationId = session.metadata?.registrationId;

      if (registrationId) {
        const { data: reg } = await supabase
          .from("registrations")
          .delete()
          .eq("id", registrationId)
          .eq("payment_status", "pending")
          .select("event_id")
          .single();

        if (reg) {
          await notifyWaitingList(reg.event_id);
        }
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as any;
      const sessionId = charge.payment_intent?.toString();

      if (sessionId) {
        const { data: sessions } = await supabase
          .from("registrations")
          .select("event_id")
          .eq("stripe_session_id", sessionId)
          .limit(1);

        if (sessions && sessions.length > 0) {
          const eventId = sessions[0].event_id;

          await supabase
            .from("registrations")
            .update({ payment_status: "refunded" })
            .eq("stripe_session_id", sessionId);

          await notifyWaitingList(eventId);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 400 });
  }
}
