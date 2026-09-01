"use client";

import { useState, useId } from "react";
import { useTranslations } from "next-intl";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/ui/turnstile";
import { useTurnstileScript } from "@/lib/use-turnstile";
import { Check, Send } from "lucide-react";

export default function ContactPage() {
  const t = useTranslations("contact");
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileLoaded = useTurnstileScript();
  const messageId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaToken) {
      setError(t("captcha_required"));
      return;
    }
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, captchaToken }),
    });

    if (!res.ok) {
      setError(t("error"));
      setCaptchaToken(null);
      setSubmitting(false);
      return;
    }

    setSent(true);
    setSubmitting(false);
  };

  if (sent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <GlassCard className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <Check className="h-8 w-8 text-success" />
          </div>
          <h1 className="font-serif text-3xl text-charcoal">{t("success")}</h1>
          <p className="mt-4 text-charcoal-light">
            {t("success_message")}
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>
      <p className="mt-2 text-charcoal-light">
        {t("subtitle")}
      </p>

      <GlassCard hover={false} className="mt-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label={t("name")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoComplete="name"
              required
            />
            <Input
              label={t("email")}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="email"
              required
            />
          </div>
          <Input
            label={t("subject")}
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
          <div className="space-y-1.5">
            <label htmlFor={messageId} className="text-sm font-medium text-charcoal-light">
              {t("message")}
            </label>
            <textarea
              id={messageId}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={5}
              required
              className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal placeholder:text-charcoal-light/50 backdrop-blur-sm focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20"
            />
          </div>
          {turnstileLoaded && (
            <Turnstile
              token={captchaToken}
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
            />
          )}
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          <Button type="submit" disabled={submitting}>
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            {submitting ? t("sending") : t("send")}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}
