import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";
import { generateICS } from "@/lib/utils";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  try {
    if (!rateLimit(`register:${clientIp(req)}`, 20)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const { eventId, fullName, email, phone, paymentStatus, captchaToken } = await req.json();

    if (!captchaToken) {
      return NextResponse.json({ error: "Missing captcha token" }, { status: 400 });
    }

    const verified = await verifyTurnstile(captchaToken);
    if (!verified) {
      return NextResponse.json({ error: "Security check failed" }, { status: 400 });
    }

    if (!eventId || typeof eventId !== "string") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (
      !fullName ||
      typeof fullName !== "string" ||
      fullName.trim().length < 2 ||
      fullName.trim().length > 100
    ) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim()) || email.length > 254) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (!phone || typeof phone !== "string" || phone.replace(/\D/g, "").length < 6) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: rpcResult, error: rpcError } = await supabase.rpc("register_for_event", {
      p_event_id: eventId,
      p_full_name: fullName.trim(),
      p_email: email.trim().toLowerCase(),
      p_phone: phone.trim(),
      p_payment_status: paymentStatus || "free",
    });

    if (rpcError) throw rpcError;

    if (rpcResult?.error) {
      return NextResponse.json(
        { error: rpcResult.error },
        { status: 409 }
      );
    }

    const registration = rpcResult;

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
            user_name: fullName.trim(),
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

          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL!,
            to: email.trim().toLowerCase(),
            subject,
            html: body,
            attachments: [
              {
                filename: `${eventData.title_ro.replace(/\s+/g, "_")}.ics`,
                content: Buffer.from(icsContent).toString("base64"),
              },
            ],
          });
        }
      }
    } catch (emailError) {
      console.error("Email send error:", emailError);
    }

    return NextResponse.json({ success: true, id: registration.id });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
