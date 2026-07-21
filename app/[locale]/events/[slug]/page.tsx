"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Turnstile } from "@/components/ui/turnstile";
import { ShareButton } from "@/components/ui/share-button";
import { AddCalendar } from "@/components/ui/add-calendar";
import { Calendar, Clock, MapPin, Users, Check, AlertCircle } from "lucide-react";
import { formatDate, formatTime } from "@/lib/utils";

interface EventData {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  description_ro: string | null;
  description_en: string | null;
  date: string;
  time: string;
  location: string | null;
  price: number;
  max_participants: number | null;
  image_url: string | null;
  whatsapp_group_link: string | null;
}

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const [event, setEvent] = useState<EventData | null>(null);
  const [registrationCount, setRegistrationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState("ro");
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [error, setError] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [turnstileLoaded, setTurnstileLoaded] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);

  useEffect(() => {
    setLocale(document.documentElement.lang || "ro");
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`)) {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = () => setTurnstileLoaded(true);
      document.head.appendChild(script);
    } else {
      setTurnstileLoaded(true);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("events")
      .select("*")
      .eq("slug", slug)
      .eq("published", true)
      .single()
      .then(({ data }) => {
        if (data) {
          setEvent(data as EventData);
          supabase
            .from("registrations")
            .select("id", { count: "exact", head: true })
            .eq("event_id", data.id)
            .neq("payment_status", "pending")
            .then(({ count }) => {
              setRegistrationCount(count || 0);
            });
        }
        setLoading(false);
      });

    const claimToken = searchParams.get("claim");
    if (claimToken) {
      handleClaimSpot(claimToken);
    }
  }, [slug, searchParams]);

  const handleClaimSpot = async (token: string) => {
    setSubmitting(true);
    const res = await fetch(`/api/register/claim-spot/${token}`);
    if (res.ok) {
      setClaimSuccess(true);
    } else {
      setError("Link invalid sau expirat / Invalid or expired link");
    }
    setSubmitting(false);
  };

  const t = (ro: string, en: string) => locale === "ro" ? ro : en;

  const handleFreeRegistration = async () => {
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event!.id,
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        captchaToken,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      if (res.status === 409) {
        setError(t("Evenimentul este complet. Înscrie-te pe lista de așteptare.", "Event is full. Join the waiting list."));
      } else {
        setError(data.error || t("Eroare la înscriere. Încearcă din nou.", "Registration error. Try again."));
      }
      setCaptchaToken(null);
      setSubmitting(false);
      return;
    }

    setRegistered(true);
    setSubmitting(false);
  };

  const handlePaidRegistration = async () => {
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event!.id,
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        paymentStatus: "pending",
        captchaToken,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      if (res.status === 409) {
        setError(t("Evenimentul este complet.", "Event is full."));
      } else {
        setError(data.error || t("Eroare la înscriere.", "Registration error."));
      }
      setCaptchaToken(null);
      setSubmitting(false);
      return;
    }

    const regData = await res.json();

    const stripeRes = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event!.id,
        registrationId: regData.id,
        price: event!.price,
        successUrl: `${window.location.origin}/${locale}/events/${event!.slug}?success=1`,
        cancelUrl: `${window.location.origin}/${locale}/events/${event!.slug}?canceled=1`,
      }),
    });

    const { url } = await stripeRes.json();
    if (url) {
      window.location.href = url;
    } else {
      setError(t("Eroare la conectarea cu Stripe.", "Error connecting to Stripe."));
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaToken) {
      setError(t("Completează verificarea de securitate.", "Complete the security check."));
      return;
    }
    if (!phoneValid) {
      setError(t("Introdu un număr de telefon valid.", "Enter a valid phone number."));
      return;
    }
    if (event!.price === 0) {
      handleFreeRegistration();
    } else {
      handlePaidRegistration();
    }
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaToken) {
      setError(t("Completează verificarea de securitate.", "Complete the security check."));
      return;
    }
    if (!phoneValid) {
      setError(t("Introdu un număr de telefon valid.", "Enter a valid phone number."));
      return;
    }
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/register/waiting-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event!.id,
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        captchaToken,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("Eroare. Încearcă din nou.", "Error. Try again."));
      setCaptchaToken(null);
      setSubmitting(false);
      return;
    }

    setWaitlistJoined(true);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-charcoal-light">Evenimentul nu a fost găsit.</p>
      </div>
    );
  }

  const title = locale === "ro" ? event.title_ro : (event.title_en || event.title_ro);
  const description = locale === "ro" ? event.description_ro : (event.description_en || event.description_ro);
  const isFull = event.max_participants != null && registrationCount >= event.max_participants;

  if (claimSuccess) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <GlassCard className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <Check className="h-8 w-8 text-success" />
          </div>
          <h1 className="font-serif text-3xl text-charcoal">
            {t("Loc revendicat!", "Spot claimed!")}
          </h1>
          <p className="mt-4 text-charcoal-light">
            {t("Veți primi un email de confirmare.", "You will receive a confirmation email.")}
          </p>
        </GlassCard>
      </div>
    );
  }

  if (registered) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <GlassCard className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <Check className="h-8 w-8 text-success" />
          </div>
          <h1 className="font-serif text-3xl text-charcoal">
            {t("Înscriere reușită!", "Registration successful!")}
          </h1>
          <p className="mt-4 text-charcoal-light">
            {t("Veți primi un email de confirmare.", "You will receive a confirmation email.")}
          </p>
          {event.whatsapp_group_link && (
            <a
              href={event.whatsapp_group_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block"
            >
              <Button variant="secondary">
                {t("Alătură-te grupului de WhatsApp", "Join WhatsApp group")}
              </Button>
            </a>
          )}
        </GlassCard>
      </div>
    );
  }

  if (waitlistJoined) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <GlassCard className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
            <Check className="h-8 w-8 text-warning" />
          </div>
          <h1 className="font-serif text-3xl text-charcoal">
            {t("Listă de așteptare", "Waiting list")}
          </h1>
          <p className="mt-4 text-charcoal-light">
            {t("Ai fost adăugat pe lista de așteptare. Veți primi un email când se eliberează un loc.", "You've been added to the waiting list. You'll receive an email when a spot opens.")}
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="grid gap-12 md:grid-cols-5">
        <div className="md:col-span-3">
          {event.image_url && (
            <div className="mb-8 aspect-video overflow-hidden rounded-3xl bg-sage/10">
              <img src={event.image_url} alt="" className="h-full w-full object-cover" />
            </div>
          )}

          <div className="flex items-start justify-between">
            <h1 className="font-serif text-4xl text-charcoal md:text-5xl">{title}</h1>
            <ShareButton title={title} />
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-sm text-charcoal-light">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> {formatDate(event.date, locale)}
            </span>
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> {formatTime(event.time)}
            </span>
            {event.location && (
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {event.location}
              </span>
            )}
            {event.max_participants && (
              <span className={`flex items-center gap-2 ${isFull ? "text-error" : ""}`}>
                <Users className="h-4 w-4" />
                {isFull
                  ? t("Complet", "Full")
                  : t("{filled}/{total} locuri", "{filled}/{total} spots").replace("{filled}", String(registrationCount)).replace("{total}", String(event.max_participants))
                }
              </span>
            )}
          </div>

          {description && (
            <div
              className="prose prose-sage mt-8 max-w-none"
              dangerouslySetInnerHTML={{ __html: description }}
            />
          )}

          <div className="mt-8">
            <AddCalendar
              event={{
                title,
                description: description || "",
                date: event.date,
                time: event.time,
                location: event.location || "",
              }}
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <GlassCard hover={false} className="sticky top-24">
            <div className="mb-6 text-center">
              <p className="text-3xl font-semibold text-rose">
                {event.price === 0 ? t("Gratuit", "Free") : `${event.price} RON`}
              </p>
              {event.max_participants && (
                <div className="mt-3">
                  <div className="flex items-center justify-center gap-1 text-sm text-charcoal-light">
                    <Users className="h-3.5 w-3.5" />
                    {t("{filled}/{total} locuri ocupate", "{filled}/{total} spots filled")
                      .replace("{filled}", String(registrationCount))
                      .replace("{total}", String(event.max_participants))}
                  </div>
                  <div className="mx-auto mt-2 h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-sage/20">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min((registrationCount / event.max_participants) * 100, 100)}%`,
                        backgroundColor: isFull ? "#E8A0B4" : "#9CAF88",
                      }}
                    />
                  </div>
                  {isFull && (
                    <p className="mt-2 flex items-center justify-center gap-1 text-sm font-medium text-error">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {t("Locuri epuizate", "Fully booked")}
                    </p>
                  )}
                </div>
              )}
            </div>

            {!isFull && !showWaitlist ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label={t("Nume complet", "Full name")}
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
                <PhoneInput
                  label={t("Telefon", "Phone")}
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  onValidChange={setPhoneValid}
                  required
                />
                {turnstileLoaded && (
                  <Turnstile
                    onVerify={setCaptchaToken}
                    onExpire={() => setCaptchaToken(null)}
                  />
                )}
                {error && <p className="text-sm text-error">{error}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting
                    ? t("Se procesează...", "Processing...")
                    : event.price === 0
                      ? t("Înscrie-te gratuit", "Register for free")
                      : t("Continuă la plată", "Proceed to payment")}
                </Button>
              </form>
            ) : isFull && !showWaitlist ? (
              <div className="text-center">
                <Button
                  variant="secondary"
                  className="w-full"
                  size="lg"
                  onClick={() => setShowWaitlist(true)}
                >
                  {t("Intră pe lista de așteptare", "Join the waiting list")}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                <p className="text-sm text-charcoal-light">
                  {t("Completează datele și te anunțăm când se eliberează un loc.", "Fill in your details and we'll let you know when a spot opens.")}
                </p>
                <Input
                  label={t("Nume complet", "Full name")}
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
                <PhoneInput
                  label={t("Telefon", "Phone")}
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  onValidChange={setPhoneValid}
                  required
                />
                {turnstileLoaded && (
                  <Turnstile
                    onVerify={setCaptchaToken}
                    onExpire={() => setCaptchaToken(null)}
                  />
                )}
                {error && <p className="text-sm text-error">{error}</p>}
                <Button type="submit" className="w-full" size="lg" variant="secondary" disabled={submitting}>
                  {submitting
                    ? t("Se procesează...", "Processing...")
                    : t("Înscrie-te pe lista de așteptare", "Join the waiting list")}
                </Button>
              </form>
            )}

            {event.whatsapp_group_link && (
              <div className="mt-6 border-t border-sage/20 pt-6 text-center">
                <p className="mb-3 text-sm text-charcoal-light">
                  {t("Alătură-te comunității:", "Join the community:")}
                </p>
                <a
                  href={event.whatsapp_group_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-sage hover:text-sage-dark"
                >
                  WhatsApp
                </a>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
