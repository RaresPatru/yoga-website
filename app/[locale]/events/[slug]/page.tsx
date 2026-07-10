"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareButton } from "@/components/ui/share-button";
import { AddCalendar } from "@/components/ui/add-calendar";
import { Calendar, Clock, MapPin, Users, Check } from "lucide-react";
import { formatDate, formatTime } from "@/lib/utils";
import { loadStripe } from "@stripe/stripe-js";

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

export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState("ro");
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLocale(document.documentElement.lang || "ro");
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
        if (data) setEvent(data as EventData);
        setLoading(false);
      });
  }, [slug]);

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
  const t = (ro: string, en: string) => locale === "ro" ? ro : en;

  const handleFreeRegistration = async () => {
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
      }),
    });

    if (!res.ok) {
      setError(t("Eroare la înscriere. Încearcă din nou.", "Registration error. Try again."));
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
        eventId: event.id,
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        paymentStatus: "pending",
      }),
    });
    if (!res.ok) {
      setError(t("Eroare la înscriere. Încearcă din nou.", "Registration error. Try again."));
      setSubmitting(false);
      return;
    }

    const stripeRes = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        price: event.price,
        successUrl: `${window.location.origin}/${locale}/events/${event.slug}?success=1`,
        cancelUrl: `${window.location.origin}/${locale}/events/${event.slug}?canceled=1`,
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
    if (event.price === 0) {
      handleFreeRegistration();
    } else {
      handlePaidRegistration();
    }
  };

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
                <p className="mt-2 flex items-center justify-center gap-1 text-sm text-charcoal-light">
                  <Users className="h-3.5 w-3.5" />
                  {t("Locuri limitate", "Limited spots")}
                </p>
              )}
            </div>

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
              <Input
                label={t("Telefon", "Phone")}
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
              {error && <p className="text-sm text-error">{error}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting
                  ? t("Se procesează...", "Processing...")
                  : event.price === 0
                    ? t("Înscrie-te gratuit", "Register for free")
                    : t("Continuă la plată", "Proceed to payment")}
              </Button>
            </form>

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
