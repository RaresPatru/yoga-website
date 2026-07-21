import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";
import { generateICS } from "@/lib/utils";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(req: Request) {
  try {
    const { eventId, fullName, email, phone, paymentStatus, captchaToken } = await req.json();

    if (captchaToken) {
      const verified = await verifyTurnstile(captchaToken);
      if (!verified) {
        return NextResponse.json({ error: "Security check failed" }, { status: 400 });
      }
    }

    const supabase = createAdminClient();

    const { data: event } = await supabase
      .from("events")
      .select("max_participants")
      .eq("id", eventId)
      .single();

    if (event?.max_participants) {
      const { count } = await supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId);

      if (count != null && count >= event.max_participants) {
        return NextResponse.json(
          { error: "Event is full" },
          { status: 409 }
        );
      }
    }

    const { error } = await supabase.from("registrations").insert({
      event_id: eventId,
      full_name: fullName,
      email,
      phone,
      payment_status: paymentStatus || "free",
    });

    if (error) throw error;

    try {
      const { data: eventData } = await supabase.from("events").select("*").eq("id", eventId).single();
      if (eventData) {
        const { data: template } = await supabase
          .from("email_templates")
          .select("*")
          .eq("type", "registration_confirmation")
          .single();

        if (template) {
          const vars: Record<string, string> = {
            user_name: fullName,
            event_name: eventData.title_ro,
            event_date: eventData.date,
            event_time: eventData.time.slice(0, 5),
            event_location: eventData.location || "",
            whatsapp_link: eventData.whatsapp_group_link || "",
          };

          const subject = template.subject_ro.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] || "");
          const body = template.body_ro.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] || "");

          const resend = getResend();
          const icsContent = generateICS({
            title: eventData.title_ro,
            description: eventData.description_ro || "",
            date: eventData.date,
            time: eventData.time,
            location: eventData.location || "",
          });

          const res = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL!,
            to: email,
            subject,
            html: body,
            attachments: [
              {
                filename: `${eventData.title_ro.replace(/\s+/g, "_")}.ics`,
                content: Buffer.from(icsContent).toString("base64"),
              },
            ],
          });

          console.log("Resend response:", JSON.stringify(res));
        }
      }
    } catch (emailError) {
      console.error("Email send error:", emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
