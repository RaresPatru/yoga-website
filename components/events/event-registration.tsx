"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Turnstile } from "@/components/ui/turnstile";
import { useTurnstileScript } from "@/lib/use-turnstile";
import { GlassCard } from "@/components/ui/glass-card";
import { formatPrice } from "@/lib/money";
import { Users, Check, AlertCircle } from "lucide-react";

/**
 * The card shown after registering, joining the waiting list, or claiming.
 *
 * Defined at module level rather than inside EventRegistration. A component
 * declared during another component's render is a brand-new type on every
 * render, so React unmounts and remounts its whole subtree each time — losing
 * DOM state and animation, for no reason. React's lint rules flag it, and they
 * are right to.
 */
function Outcome({
  tone,
  heading,
  body,
  whatsappLink,
  whatsappLabel,
}: {
  tone: "success" | "warning";
  heading: string;
  body: string;
  whatsappLink?: string | null;
  whatsappLabel?: string;
}) {
  return (
    <GlassCard hover={false} className="sticky top-24 text-center">
      <div
        className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
          tone === "success" ? "bg-success/10" : "bg-warning/10"
        }`}
      >
        <Check className={`h-8 w-8 ${tone === "success" ? "text-success" : "text-warning"}`} />
      </div>
      <h2 className="font-serif text-2xl text-charcoal">{heading}</h2>
      <p className="mt-3 text-charcoal-light">{body}</p>
      {whatsappLink && tone === "success" && (
        <div className="mt-6">
          {/* asChild renders a single styled <a>. Wrapping a <button> in an <a>
              is invalid HTML and ambiguous for screen readers. */}
          <Button asChild variant="secondary">
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
              {whatsappLabel}
            </a>
          </Button>
        </div>
      )}
    </GlassCard>
  );
}

interface EventRegistrationProps {
  eventId: string;
  price: number;
  /** ISO code from the event row — never assumed, since it decides what is charged. */
  currency: string;
  maxParticipants: number | null;
  /** Seats already taken, counted server-side from the availability view. */
  taken: number;
  whatsappLink: string | null;
  locale: string;
}

/**
 * The interactive part of an event page: the price card, the registration form,
 * the waiting-list form, and the handler for waiting-list claim links.
 *
 * WHY THIS IS SPLIT OUT
 *
 * The whole event page used to be one client component. That meant the title,
 * date, price and description were fetched in the browser after hydration and
 * existed nowhere in the HTML — so search engines and social-media crawlers saw
 * an empty page for the thing this site exists to sell. Sharing an event to
 * Instagram produced a blank preview.
 *
 * Now the page itself is a server component and only this panel — the part that
 * genuinely needs state and event handlers — ships as client JavaScript. The
 * content is in the HTML for anyone who asks for it, and the interactivity
 * still works exactly as before. That is the point of the "islands" idea: not
 * server *or* client, but the small interactive bits embedded in server-
 * rendered content.
 */
export function EventRegistration({
  eventId,
  price,
  currency,
  maxParticipants,
  taken,
  whatsappLink,
  locale,
}: EventRegistrationProps) {
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [error, setError] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const turnstileLoaded = useTurnstileScript();

  const t = useCallback(
    (ro: string, en: string) => (locale === "ro" ? ro : en),
    [locale]
  );

  const isFull = maxParticipants != null && taken >= maxParticipants;

  // Arriving from a waiting-list email: ?claim=<waiting list entry id>.
  useEffect(() => {
    const claimToken = searchParams.get("claim");
    if (!claimToken) return;

    fetch(`/api/register/claim-spot/${claimToken}`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          // 410 Gone means the 24-hour window closed. Worth saying plainly
          // rather than showing the same "invalid link" message as a bad token
          // — the seat may well still be free to book normally, and the form is
          // right there.
          setError(
            res.status === 410
              ? t(
                  "Linkul a expirat. Dacă mai sunt locuri, te poți înscrie mai jos.",
                  "This link has expired. If seats remain, you can register below."
                )
              : t("Link invalid sau expirat", "Invalid or expired link")
          );
          return;
        }

        // Paid event: the seat is held as 'pending' and Stripe finishes it.
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }

        setClaimSuccess(true);
      })
      .catch(() => setError(t("Link invalid sau expirat", "Invalid or expired link")))
      .finally(() => setSubmitting(false));
  }, [searchParams, t]);

  const handleFreeRegistration = async () => {
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, ...form, captchaToken }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        res.status === 409
          ? t(
              "Evenimentul este complet. Înscrie-te pe lista de așteptare.",
              "Event is full. Join the waiting list."
            )
          : data.error || t("Eroare la înscriere. Încearcă din nou.", "Registration error. Try again.")
      );
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
      body: JSON.stringify({ eventId, ...form, captchaToken }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        res.status === 409
          ? t("Evenimentul este complet.", "Event is full.")
          : data.error || t("Eroare la înscriere.", "Registration error.")
      );
      setCaptchaToken(null);
      setSubmitting(false);
      return;
    }

    const regData = await res.json();

    const stripeRes = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, registrationId: regData.id, locale }),
    });

    if (!stripeRes.ok) {
      const data = await stripeRes.json().catch(() => ({}));
      setError(data.error || t("Eroare la conectarea cu Stripe.", "Error connecting to Stripe."));
      setCaptchaToken(null);
      setSubmitting(false);
      return;
    }

    const { url } = await stripeRes.json();
    if (url) {
      window.location.href = url;
    } else {
      setError(t("Eroare la conectarea cu Stripe.", "Error connecting to Stripe."));
      setSubmitting(false);
    }
  };

  const guard = () => {
    if (!captchaToken) {
      setError(t("Completează verificarea de securitate.", "Complete the security check."));
      return false;
    }
    if (!phoneValid) {
      setError(t("Introdu un număr de telefon valid.", "Enter a valid phone number."));
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guard()) return;
    if (price === 0) handleFreeRegistration();
    else handlePaidRegistration();
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guard()) return;

    setSubmitting(true);
    setError("");

    const res = await fetch("/api/register/waiting-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, ...form, captchaToken }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("Eroare. Încearcă din nou.", "Error. Try again."));
      setCaptchaToken(null);
      setSubmitting(false);
      return;
    }

    setWaitlistJoined(true);
    setSubmitting(false);
  };

  if (claimSuccess) {
    return (
      <Outcome
        tone="success"
        heading={t("Loc revendicat!", "Spot claimed!")}
        body={t("Veți primi un email de confirmare.", "You will receive a confirmation email.")}
        whatsappLink={whatsappLink}
        whatsappLabel={t("Alătură-te grupului de WhatsApp", "Join WhatsApp group")}
      />
    );
  }

  if (registered) {
    return (
      <Outcome
        tone="success"
        heading={t("Înscriere reușită!", "Registration successful!")}
        body={t("Veți primi un email de confirmare.", "You will receive a confirmation email.")}
        whatsappLink={whatsappLink}
        whatsappLabel={t("Alătură-te grupului de WhatsApp", "Join WhatsApp group")}
      />
    );
  }

  if (waitlistJoined) {
    return (
      <Outcome
        tone="warning"
        heading={t("Listă de așteptare", "Waiting list")}
        body={t(
          "Ai fost adăugat pe lista de așteptare. Veți primi un email când se eliberează un loc.",
          "You've been added to the waiting list. You'll receive an email when a spot opens."
        )}
      />
    );
  }

  const fields = (
    <>
      <Input
        label={t("Nume complet", "Full name")}
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        autoComplete="name"
        required
      />
      <Input
        label="Email"
        type="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        autoComplete="email"
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
        <Turnstile onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
      )}
      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </>
  );

  return (
    <GlassCard hover={false} className="sticky top-24">
      <div className="mb-6 text-center">
        <p className="text-3xl font-semibold text-rose-deep">
          {price === 0 ? t("Gratuit", "Free") : formatPrice(price, currency, locale)}
        </p>
        {maxParticipants && (
          <div className="mt-3">
            <div className="flex items-center justify-center gap-1 text-sm text-charcoal-light">
              <Users className="h-3.5 w-3.5" />
              {t("{filled}/{total} locuri ocupate", "{filled}/{total} spots filled")
                .replace("{filled}", String(taken))
                .replace("{total}", String(maxParticipants))}
            </div>
            <div className="mx-auto mt-2 h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-sage/20">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min((taken / maxParticipants) * 100, 100)}%`,
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
          {fields}
          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting
              ? t("Se procesează...", "Processing...")
              : price === 0
                ? t("Înscrie-te gratuit", "Register for free")
                : t("Continuă la plată", "Proceed to payment")}
          </Button>
        </form>
      ) : isFull && !showWaitlist ? (
        <div className="text-center">
          {error && (
            <p className="mb-4 text-sm text-error" role="alert">
              {error}
            </p>
          )}
          <Button variant="secondary" className="w-full" size="lg" onClick={() => setShowWaitlist(true)}>
            {t("Intră pe lista de așteptare", "Join the waiting list")}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleWaitlistSubmit} className="space-y-4">
          <p className="text-sm text-charcoal-light">
            {t(
              "Completează datele și te anunțăm când se eliberează un loc.",
              "Fill in your details and we'll let you know when a spot opens."
            )}
          </p>
          {fields}
          <Button type="submit" className="w-full" size="lg" variant="secondary" disabled={submitting}>
            {submitting
              ? t("Se procesează...", "Processing...")
              : t("Înscrie-te pe lista de așteptare", "Join the waiting list")}
          </Button>
        </form>
      )}

      {whatsappLink && (
        <div className="mt-6 border-t border-sage/20 pt-6 text-center">
          <p className="mb-3 text-sm text-charcoal-light">
            {t("Alătură-te comunității:", "Join the community:")}
          </p>
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-sage-deep hover:text-rose-deep"
          >
            WhatsApp
          </a>
        </div>
      )}
    </GlassCard>
  );
}
