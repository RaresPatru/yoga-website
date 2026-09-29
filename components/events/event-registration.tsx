"use client";

import { useEffect, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui/phone-input";
import { Turnstile } from "@/components/ui/turnstile";
import { useTurnstileScript } from "@/lib/use-turnstile";
import { GlassCard } from "@/components/ui/glass-card";
import { formatPrice } from "@/lib/money";
import { NOTE_MAX_LENGTH } from "@/lib/validate-attendee";
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
  icon = "check",
}: {
  tone: "success" | "warning";
  /** A tick for something done; the alert for news that is not what they hoped. */
  icon?: "check" | "alert";
  heading: string;
  body: string;
  whatsappLink?: string | null;
  whatsappLabel?: string;
}) {
  return (
    <GlassCard hover={false} floating className="sticky top-24 text-center">
      <div
        className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
          tone === "success" ? "bg-success/10" : "bg-warning/10"
        }`}
      >
        {icon === "alert" ? (
          <AlertCircle className="h-8 w-8 text-warning" aria-hidden="true" />
        ) : (
          <Check className={`h-8 w-8 ${tone === "success" ? "text-success" : "text-warning"}`} aria-hidden="true" />
        )}
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

type Stage = "form" | "registered" | "waitlisted" | "claimed" | "claim_taken";

/** What the page says for a refusal, from the `code` every route answers with. */
function errorKey(code: unknown, status: number, waitlisting: boolean): string {
  switch (code) {
    case "started":
      return "error_started";
    case "note_needs_consent":
      return "error_note_consent";
    case "note_too_long":
      return "error_note_long";
    case "already_waiting":
      return "error_already_waiting";
    case "full":
      return waitlisting ? "error_generic" : "error_full_waitlist";
  }
  return status === 409 && !waitlisting ? "error_full" : "error_generic";
}

/**
 * The interactive part of an event page: the price card, the registration form,
 * the waiting-list form, and the handler for waiting-list claim links.
 *
 * WHY THIS IS SPLIT OUT
 *
 * The whole event page used to be one client component, so the title, date,
 * price and description existed nowhere in the HTML and sharing an event to
 * Instagram produced a blank preview. Now the page is a server component and
 * only this panel, the part that needs state and event handlers, ships as
 * client JavaScript.
 *
 * ONE FORM, THREE DESTINATIONS
 *
 * A free booking, a paid one and a place on the waiting list send the same
 * fields (the details, the optional note with its consent, the opt-in and the
 * page's language) and fail the same ways, so they share one submit. Only
 * what happens after differs: a paid booking continues to Stripe.
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
  const t = useTranslations("booking");
  const searchParams = useSearchParams();
  const ids = useId();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", note: "" });
  const [noteConsent, setNoteConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const turnstileLoaded = useTurnstileScript();

  /*
   * NULL or 0 seats is sold out, not unlimited. The reasoning is in
   * components/events/seat-count.tsx; the enforcement is in
   * register_for_event(), which is what matters — this flag decides which form
   * to draw, and a drawn form is not permission to book.
   */
  const isFull = !maxParticipants || taken >= maxParticipants;

  // Arriving from a waiting-list email: ?claim=<waiting list entry id>.
  useEffect(() => {
    const claimToken = searchParams.get("claim");
    if (!claimToken) return;

    fetch(`/api/register/claim-spot/${claimToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          // Somebody booked the seat first. Not an error of theirs, and not a
          // dead link: the offer was a head start, and they keep their place.
          if (data.code === "taken") {
            setStage("claim_taken");
            return;
          }
          // 410 Gone means the 24-hour window closed. The seat may well still
          // be free to book normally, and the form is right there.
          setError(
            t(data.code === "started" ? "error_started" : res.status === 410 ? "claim_expired" : "claim_invalid")
          );
          return;
        }

        // Paid event: the seat is held as 'pending' and Stripe finishes it.
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
        setStage("claimed");
      })
      .catch(() => setError(t("claim_invalid")));
  }, [searchParams, t, locale]);

  const post = (url: string, body: unknown) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  /** Shows a refusal, and asks for a fresh CAPTCHA: a token is good for one try. */
  const fail = (key: string) => {
    setError(t(key, { max: NOTE_MAX_LENGTH }));
    setCaptchaToken(null);
    setSubmitting(false);
  };

  const submit = async (e: React.FormEvent, waitlisting: boolean) => {
    e.preventDefault();
    if (!captchaToken) return setError(t("error_captcha"));
    if (!phoneValid) return setError(t("error_phone"));
    if (form.note.trim() && !noteConsent) return setError(t("error_note_consent"));

    setSubmitting(true);
    setError("");

    const details = {
      eventId,
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      note: form.note,
      noteConsent,
      marketing,
      captchaToken,
      locale,
    };

    try {
      const res = await post(waitlisting ? "/api/register/waiting-list" : "/api/register", details);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return fail(errorKey(data.code, res.status, waitlisting));

      if (waitlisting) {
        setStage("waitlisted");
      } else if (price > 0) {
        // Paid: the booking is held as pending while they pay at Stripe.
        const checkout = await post("/api/stripe/checkout", { eventId, registrationId: data.id, locale });
        const { url } = await checkout.json().catch(() => ({ url: null }));
        if (!checkout.ok || !url) return fail("error_stripe");
        window.location.href = url;
        return;
      } else {
        setStage("registered");
      }
      setSubmitting(false);
    } catch {
      fail("error_generic");
    }
  };

  if (stage === "claim_taken") {
    return <Outcome tone="warning" icon="alert" heading={t("taken_title")} body={t("taken_body")} />;
  }
  if (stage === "claimed" || stage === "registered") {
    return (
      <Outcome
        tone="success"
        heading={t(stage === "claimed" ? "claimed_title" : "registered_title")}
        body={t("registered_body")}
        whatsappLink={whatsappLink}
        whatsappLabel={t("join_whatsapp")}
      />
    );
  }
  if (stage === "waitlisted") {
    return <Outcome tone="warning" heading={t("waitlist_title")} body={t("waitlist_body")} />;
  }

  const noteId = `${ids}-note`;
  const fields = (
    <>
      <Input
        label={t("full_name")}
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
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
      <PhoneInput
        label={t("phone")}
        value={form.phone}
        onChange={(v) => setForm({ ...form, phone: v })}
        onValidChange={setPhoneValid}
        required
      />

      {/*
        Optional, and often about health, which is why keeping it needs its own
        explicit consent: the box appears as soon as there is something to
        consent to, and the note is not sent without it.
      */}
      <div className="space-y-1.5">
        <label htmlFor={noteId} className="text-sm font-medium text-charcoal-light">
          {t("note_label")}
        </label>
        <textarea
          id={noteId}
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          maxLength={NOTE_MAX_LENGTH}
          rows={2}
          aria-describedby={`${noteId}-hint`}
          className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-base text-charcoal transition-colors duration-200"
        />
        <p id={`${noteId}-hint`} className="text-sm text-charcoal-light">
          {t("note_hint")}
        </p>
      </div>
      {form.note.trim() && (
        <Checkbox
          label={t("note_consent")}
          checked={noteConsent}
          onChange={(e) => setNoteConsent(e.target.checked)}
          required
        />
      )}
      <Checkbox label={t("marketing")} checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />

      {turnstileLoaded && (
        <Turnstile token={captchaToken} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
      )}
      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </>
  );

  const privacy = (
    <p className="text-center text-xs text-charcoal-light">
      {t("privacy_before")}
      <a href={`/${locale}/privacy`} className="text-sage-deep underline underline-offset-2 hover:text-rose-deep">
        {t("privacy_link")}
      </a>
    </p>
  );

  return (
    <GlassCard hover={false} floating className="sticky top-24">
      <div className="mb-6 text-center">
        <p className="text-3xl font-semibold text-rose-deep">
          {price === 0 ? t("free") : formatPrice(price, currency, locale)}
        </p>
        {/*
          The bar needs a real number to draw; the sold-out line does not. So
          they are separate: a bar when there is something to fill, and the
          state in words whenever it is true.
        */}
        <div className="mt-3">
          {maxParticipants ? (
            <>
              <div className="flex items-center justify-center gap-1 text-sm text-charcoal-light">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {t("spots_filled", { filled: taken, total: maxParticipants })}
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
            </>
          ) : null}
          {isFull && (
            <p className="mt-2 flex items-center justify-center gap-1 text-sm font-medium text-error">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {/* The site's one phrase for this state: components/events/seat-count.tsx. */}
              {t("sold_out")}
            </p>
          )}
        </div>
      </div>

      {!isFull && !showWaitlist ? (
        <form onSubmit={(e) => submit(e, false)} className="space-y-4">
          {fields}
          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? t("processing") : price === 0 ? t("register_free") : t("register_paid")}
          </Button>
          {privacy}
        </form>
      ) : isFull && !showWaitlist ? (
        <div className="text-center">
          {error && (
            <p className="mb-4 text-sm text-error" role="alert">
              {error}
            </p>
          )}
          <Button variant="secondary" className="w-full" size="lg" onClick={() => setShowWaitlist(true)}>
            {t("waitlist_open")}
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => submit(e, true)} className="space-y-4">
          <p className="text-sm text-charcoal-light">{t("waitlist_intro")}</p>
          {fields}
          <Button type="submit" className="w-full" size="lg" variant="secondary" disabled={submitting}>
            {submitting ? t("processing") : t("waitlist_submit")}
          </Button>
          {privacy}
        </form>
      )}

      {whatsappLink && (
        <div className="mt-6 border-t border-sage/20 pt-6 text-center">
          <p className="mb-3 text-sm text-charcoal-light">{t("community")}</p>
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
