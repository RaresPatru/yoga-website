"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/ui/turnstile";
import { useTurnstileScript } from "@/lib/use-turnstile";

/**
 * "Send me the link": one email field and the CAPTCHA. Whatever address is
 * typed, the answer is the same (/api/reviews/request), so the form can only
 * ever say "check your email".
 */
export function ShareForm({ locale }: { locale: string }) {
  const t = useTranslations("reviews");
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const turnstileLoaded = useTurnstileScript();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!captchaToken) return setError(t("error_captcha"));
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/reviews/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, captchaToken, locale }),
      });
      if (response.ok) {
        setSent(true);
        return;
      }
      const { code } = await response.json().catch(() => ({ code: "" }));
      setError(t(code === "email" ? "error_email" : code === "rate" ? "error_rate" : code === "captcha" ? "error_captcha" : "error_generic"));
      setCaptchaToken(null);
    } catch {
      setError(t("error_generic"));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="text-center">
        <MailCheck className="mx-auto h-10 w-10 text-sage-deep" aria-hidden="true" />
        <h2 className="mt-4 font-serif text-2xl text-charcoal">{t("sent_title")}</h2>
        <p className="mt-3 text-charcoal-light">{t("sent_body")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        label={t("email_label")}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      {turnstileLoaded && (
        <Turnstile token={captchaToken} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
      )}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={sending}>
        {sending ? t("sending") : t("send_link")}
      </Button>
    </form>
  );
}
