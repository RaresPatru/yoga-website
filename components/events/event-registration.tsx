"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui/phone-input";
import { Turnstile } from "@/components/ui/turnstile";
import { useTurnstileScript } from "@/lib/use-turnstile";
import { GlassCard } from "@/components/ui/glass-card";
import { formatPrice, toCurrency } from "@/lib/money";
import { NOTE_MAX_LENGTH } from "@/lib/validate-attendee";
import { REVOLUT_PAY_CURRENCIES } from "@/lib/payment-methods";
import { EVENT_TIME_ZONE } from "@/lib/utils";
import { track } from "@/components/providers/analytics";
import { Users, Check, AlertCircle, Clock } from "lucide-react";

/**
 * The card shown after registering, joining the waiting list, claiming, or
 * coming back from Stripe.
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
  children,
}: {
  tone: "success" | "warning";
  /** A tick for something done, the clock for something waiting, the alert for news that is not what they hoped. */
  icon?: "check" | "alert" | "clock";
  heading: string;
  body: string;
  whatsappLink?: string | null;
  whatsappLabel?: string;
  /** Actions under the text. */
  children?: ReactNode;
}) {
  const Icon = icon === "alert" ? AlertCircle : icon === "clock" ? Clock : Check;
  return (
    <GlassCard hover={false} floating className="sticky top-24 text-center">
      <div
        className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
          tone === "success" ? "bg-success/10" : "bg-warning/10"
        }`}
      >
        <Icon className={`h-8 w-8 ${tone === "success" ? "text-success" : "text-warning"}`} aria-hidden="true" />
      </div>
      {/* role="status": the card replaces the form after an action, and a
          screen reader should hear what happened without hunting for it. */}
      <div role="status">
        <h2 className="font-serif text-2xl text-charcoal">{heading}</h2>
        <p className="mt-3 text-charcoal-light">{body}</p>
      </div>
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
      {children}
    </GlassCard>
  );
}

interface EventRegistrationProps {
  eventId: string;
  /** The event's address, which names it in the statistics. */
  slug: string;
  price: number;
  /** ISO code from the event row — never assumed, since it decides what is charged. */
  currency: string;
  maxParticipants: number | null;
  /** Seats already taken, counted server-side from the availability view. */
  taken: number;
  whatsappLink: string | null;
  locale: string;
}

type Stage =
  | "form"
  | "registered"
  | "waitlisted"
  | "claimed"
  | "claim_taken"
  // Back from Stripe:
  | "checking"
  | "paid"
  | "processing"
  | "held"
  | "released"
  | "returned";

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
    case "already_registered":
      return "error_already_registered";
    case "stripe":
      return "error_stripe";
    case "full":
      return waitlisting ? "error_generic" : "error_full_waitlist";
  }
  return status === 409 && !waitlisting ? "error_full" : "error_generic";
}

/** A moment as the hour it happens in Romania: "14:35". */
function hourOf(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  }).format(new Date(iso));
}

/** How long the page keeps asking about a payment it was sent back from, before saying it is still being confirmed. */
const PROCESSING_TRIES = 5;
const PROCESSING_GAP_MS = 2000;

/**
 * The interactive part of an event page: the price card, the registration form,
 * the waiting-list form, the handler for waiting-list claim links, and what a
 * visitor sees when Stripe sends them back.
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
 * what happens after differs: a paid booking is answered with the Stripe page
 * to pay on, and the browser goes there.
 *
 * BACK FROM STRIPE
 *
 * Stripe sends the visitor back with the checkout's id (?checkout=…, with
 * &paid=1 after paying), and /api/checkout says what became of it: paid,
 * still open because they turned back (the seat is held until a given time,
 * and they can resume or give it up), expired, or refunded because the
 * booking was gone by the time the money came. The id is taken out of the
 * address at once: it is a key to that checkout's state, and a copied link
 * should not carry it.
 *
 * STATISTICS
 *
 * Pressing the button is booking_clicked; what came of it is
 * booking_completed, waitlist_joined or booking_failed with its reason
 * (lib/analytics.ts). Nothing typed into the form is sent.
 */
export function EventRegistration({
  eventId,
  slug,
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
  const [notice, setNotice] = useState("");
  const [held, setHeld] = useState<{ session: string; until: string } | null>(null);
  const [phoneValid, setPhoneValid] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const turnstileLoaded = useTurnstileScript();
  const checkoutHandled = useRef(false);

  /*
   * NULL or 0 seats is sold out, not unlimited. The reasoning is in
   * components/events/seat-count.tsx; the enforcement is in
   * register_for_event(), which is what matters — this flag decides which form
   * to draw, and a drawn form is not permission to book.
   */
  const isFull = !maxParticipants || taken >= maxParticipants;

  /*
   * What came of a booking, for the statistics: recorded when the panel
   * changes to say so, however it got there (the form, a claim link, or the
   * way back from Stripe).
   */
  useEffect(() => {
    if (stage === "registered" || stage === "claimed" || stage === "paid") {
      track("booking_completed", {
        event_slug: slug,
        paid: stage === "paid",
        via: stage === "registered" ? "form" : stage === "claimed" ? "claim" : "checkout",
      });
    } else if (stage === "waitlisted") {
      track("waitlist_joined", { event_slug: slug });
    }
  }, [stage, slug]);

  const post = (url: string, body: unknown) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  /** Sends the browser to Stripe, or shows that it is paid already. */
  const goPay = (data: { checkoutUrl?: string; paid?: boolean }) => {
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return true;
    }
    if (data.paid) {
      setStage("paid");
      return true;
    }
    return false;
  };

  /*
   * Someone who went to Stripe and pressed the browser's Back button can get
   * this page from the back-forward cache, exactly as they left it: the button
   * still saying "Se procesează..." and disabled, and the CAPTCHA token already
   * spent on the request that sent them. Both are put right, and the widget
   * re-arms itself when the token goes.
   */
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setSubmitting(false);
      setCaptchaToken(null);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  // Arriving from a waiting-list email: ?claim=<waiting list entry id>.
  useEffect(() => {
    const claimToken = searchParams.get("claim");
    if (!claimToken) return;

    const failed = (reason: string) =>
      track("booking_failed", { event_slug: slug, waitlist: false, reason: `claim_${reason}` });

    post(`/api/register/claim-spot/${claimToken}`, { locale })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          failed(typeof data.code === "string" ? data.code : res.status === 410 ? "expired" : `http_${res.status}`);
          // Somebody booked the seat first. Not an error of theirs, and not a
          // dead link: the offer was a head start, and they keep their place.
          if (data.code === "taken") {
            setStage("claim_taken");
            return;
          }
          // 410 Gone means the 24-hour window closed. The seat may well still
          // be free to book normally, and the form is right there.
          setError(
            t(
              data.code === "started"
                ? "error_started"
                : data.code === "already_registered"
                  ? "error_already_registered"
                  : data.code === "stripe"
                    ? "error_stripe"
                    : res.status === 410
                      ? "claim_expired"
                      : "claim_invalid"
            )
          );
          return;
        }

        // Paid event: the seat is held as 'pending' and Stripe finishes it.
        if (goPay(data)) return;
        setStage("claimed");
      })
      .catch(() => {
        failed("network");
        setError(t("claim_invalid"));
      });
  }, [searchParams, t, locale, slug]);

  // Back from Stripe: ?checkout=<session id>, and &paid=1 after paying.
  useEffect(() => {
    const session = searchParams.get("checkout");
    if (!session || checkoutHandled.current) return;
    checkoutHandled.current = true;
    const cameBackPaid = searchParams.get("paid") === "1";
    window.history.replaceState(null, "", window.location.pathname);
    setStage("checking");

    let timer: number | undefined;
    const ask = async (attempt: number): Promise<void> => {
      let state = "unknown";
      let until = "";
      try {
        const res = await post("/api/checkout", { session, action: "status", locale });
        const data = await res.json().catch(() => ({}));
        state = typeof data.state === "string" ? data.state : "unknown";
        until = typeof data.until === "string" ? data.until : "";
      } catch {
        state = "unknown";
      }

      if (state === "paid") return setStage("paid");
      if (state === "returned") return setStage("returned");
      if (state === "open" && until) {
        setHeld({ session, until });
        return setStage("held");
      }
      if (state === "expired") {
        setNotice(t("checkout_expired"));
        return setStage("form");
      }
      // Paid, but not confirmed yet: Stripe answers late now and then. Ask a
      // few more times before saying so.
      if (cameBackPaid) {
        setStage("processing");
        if (attempt < PROCESSING_TRIES) {
          timer = window.setTimeout(() => void ask(attempt + 1), PROCESSING_GAP_MS);
        }
        return;
      }
      setStage("form");
    };
    void ask(1);
    return () => window.clearTimeout(timer);
  }, [searchParams, t, locale]);

  /** Resumes the checkout they turned back from, or gives its seat up. */
  const actOnHeld = async (action: "resume" | "release") => {
    if (!held) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await post("/api/checkout", { session: held.session, action, locale });
      const data = await res.json().catch(() => ({}));
      if (data.state === "open" && typeof data.url === "string") {
        window.location.href = data.url;
        return;
      }
      if (data.state === "paid") setStage("paid");
      else if (data.state === "released") setStage("released");
      else if (data.state === "expired") {
        setNotice(t("checkout_expired"));
        setStage("form");
      } else setError(t("error_stripe"));
    } catch {
      setError(t("error_stripe"));
    }
    setSubmitting(false);
  };

  /** Shows a refusal, and asks for a fresh CAPTCHA: a token is good for one try. */
  const fail = (key: string) => {
    setError(t(key, { max: NOTE_MAX_LENGTH }));
    setCaptchaToken(null);
    setSubmitting(false);
  };

  const submit = async (e: React.FormEvent, waitlisting: boolean) => {
    e.preventDefault();
    // Sent at once: a paid booking leaves for Stripe moments later.
    track("booking_clicked", { event_slug: slug, paid: price > 0, waitlist: waitlisting }, { leaving: true });
    const failed = (reason: string) => track("booking_failed", { event_slug: slug, waitlist: waitlisting, reason });

    if (!captchaToken) {
      failed("captcha");
      return setError(t("error_captcha"));
    }
    if (!phoneValid) {
      failed("phone");
      return setError(t("error_phone"));
    }
    if (form.note.trim() && !noteConsent) {
      failed("note_consent");
      return setError(t("error_note_consent"));
    }

    setSubmitting(true);
    setError("");
    setNotice("");

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
      if (!res.ok) {
        failed(typeof data.code === "string" ? data.code : `http_${res.status}`);
        return fail(errorKey(data.code, res.status, waitlisting));
      }

      if (waitlisting) {
        setStage("waitlisted");
      } else if (price > 0) {
        // Paid: the server opened the checkout; the booking is held while
        // they pay.
        if (goPay(data)) return;
        failed("no_checkout");
        return fail("error_stripe");
      } else {
        setStage("registered");
      }
      setSubmitting(false);
    } catch {
      failed("network");
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
  if (stage === "paid") {
    return (
      <Outcome
        tone="success"
        heading={t("paid_title")}
        body={t("paid_body")}
        whatsappLink={whatsappLink}
        whatsappLabel={t("join_whatsapp")}
      />
    );
  }
  if (stage === "processing") {
    return <Outcome tone="warning" icon="clock" heading={t("processing_title")} body={t("processing_body")} />;
  }
  if (stage === "returned") {
    return <Outcome tone="warning" icon="alert" heading={t("returned_title")} body={t("returned_body")} />;
  }
  if (stage === "released") {
    return <Outcome tone="warning" heading={t("released_title")} body={t("released_body")} />;
  }
  if (stage === "held" && held) {
    return (
      <Outcome
        tone="warning"
        icon="clock"
        heading={t("held_title")}
        body={t("held_body", { time: hourOf(held.until, locale) })}
      >
        <div className="mt-6 flex flex-col items-stretch gap-2">
          <Button size="lg" disabled={submitting} onClick={() => actOnHeld("resume")}>
            {submitting ? t("processing") : t("resume")}
          </Button>
          <Button variant="ghost" disabled={submitting} onClick={() => actOnHeld("release")}>
            {t("release")}
          </Button>
        </div>
        {error && (
          <p className="mt-4 text-sm text-error" role="alert">
            {error}
          </p>
        )}
      </Outcome>
    );
  }
  if (stage === "checking") {
    return (
      <GlassCard hover={false} floating className="sticky top-24 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" aria-hidden="true" />
        <p role="status" className="text-charcoal-light">
          {t("checking")}
        </p>
      </GlassCard>
    );
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
      {t("terms_before")}
      <a href={`/${locale}/terms`} className="text-sage-deep underline underline-offset-2 hover:text-rose-deep">
        {t("terms_link")}
      </a>
      {t("terms_after")}
    </p>
  );

  return (
    <GlassCard hover={false} floating className="sticky top-24">
      <div className="mb-6 text-center">
        <p className="text-3xl font-semibold text-rose-deep">
          {price === 0 ? t("free") : formatPrice(price, currency, locale)}
        </p>
        {price > 0 && (
          <p className="mt-1 text-sm text-charcoal-light">
            {REVOLUT_PAY_CURRENCIES.includes(toCurrency(currency)) ? t("pay_methods_revolut") : t("pay_methods_card")}
          </p>
        )}
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

      {notice && (
        <p role="status" className="mb-4 rounded-xl bg-warning/10 px-4 py-3 text-sm text-charcoal">
          {notice}
        </p>
      )}

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
