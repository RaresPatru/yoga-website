import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  try {
    if (!rateLimit(`contact:${clientIp(req)}`, 5)) {
      return NextResponse.json(
        { error: "Too many messages. Please try again later." },
        { status: 429 }
      );
    }

    const { name, email, subject, message, captchaToken } = await req.json();

    if (!captchaToken) {
      return NextResponse.json({ error: "Missing captcha token" }, { status: 400 });
    }

    const verified = await verifyTurnstile(captchaToken);
    if (!verified) {
      return NextResponse.json({ error: "Security check failed" }, { status: 400 });
    }

    if (
      !name ||
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 100
    ) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim()) || email.length > 254) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (!message || typeof message !== "string" || message.trim().length < 10 || message.length > 5000) {
      return NextResponse.json({ error: "Message must be between 10 and 5000 characters" }, { status: 400 });
    }

    const cleanSubject = subject && typeof subject === "string" ? subject.trim().slice(0, 200) : null;

    const supabase = createAdminClient();

    const { error } = await supabase.from("contact_messages").insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: cleanSubject,
      message: message.trim(),
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Contact error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
