import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";
import { generateICS } from "@/lib/utils";

export async function POST(req: Request) {
  try {
    const { eventId, fullName, email, phone, paymentStatus } = await req.json();

    const supabase = createAdminClient();

    const { error } = await supabase.from("registrations").insert({
      event_id: eventId,
      full_name: fullName,
      email,
      phone,
      payment_status: paymentStatus || "free",
    });

    if (error) throw error;

    // Send confirmation email
    try {
      const { data: event } = await supabase.from("events").select("*").eq("id", eventId).single();
      if (event) {
        const { data: template } = await supabase
          .from("email_templates")
          .select("*")
          .eq("type", "registration_confirmation")
          .single();

        if (template) {
          const vars: Record<string, string> = {
            user_name: fullName,
            event_name: event.title_ro,
            event_date: event.date,
            event_time: event.time.slice(0, 5),
            event_location: event.location || "",
            whatsapp_link: event.whatsapp_group_link || "",
          };

          const subject = template.subject_ro.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] || "");
          const body = template.body_ro.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] || "");

          const resend = getResend();
          const icsContent = generateICS({
            title: event.title_ro,
            description: event.description_ro || "",
            date: event.date,
            time: event.time,
            location: event.location || "",
          });

          const res = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL!,
            to: email,
            subject,
            html: body,
            attachments: [
              {
                filename: `${event.title_ro.replace(/\s+/g, "_")}.ics`,
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
