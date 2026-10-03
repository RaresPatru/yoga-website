"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Mail, MessageCircle, Phone, X } from "lucide-react";
import { adminErrorKey, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { countSentence } from "@/lib/admin/plural";
import {
  loadParticipant,
  participantAction,
  ParticipantActionError,
  saveAdminNote,
  type Participant,
} from "@/lib/admin/participants";
import {
  REMOVAL_REASON_MAX,
  type ParticipantAction,
  type ParticipantDetails,
} from "@/lib/admin/participant-actions";
import { announcementVerdict, stopAnnouncements } from "@/lib/admin/emails";
import { formatPaid, formatPrice } from "@/lib/money";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { useToast } from "@/components/admin/ui/toaster";
import { StatusChip, eventDay, longMoment, shortDay } from "./status-chip";
import { DetailsDialog } from "./details-dialog";
import { cn } from "@/lib/utils";

/** How long her note waits after the last keystroke before it saves. */
const NOTE_IDLE_MS = 800;
const DAY_MS = 24 * 60 * 60 * 1000;

type NoteState = "idle" | "saving" | "saved" | "failed";

/**
 * One participant, in a panel over the list: a sheet from the right on a
 * computer, the whole screen on a phone. Opened by its own address
 * (?p=<id>), so the back button closes it and a refresh keeps it open.
 *
 * It is a modal <dialog>: the browser keeps focus inside, Escape closes it,
 * and a click on the dimmed list beside it does too.
 */
export function ParticipantPanel({
  id,
  onClose,
  onOpen,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  /** Opens another row of their history in the panel. */
  onOpen: (id: string) => void;
  /** Something about this person changed: the list behind should reload. */
  onChanged: () => void;
}) {
  const { t, locale } = useAdminLocale();
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";
  const toast = useToast();
  const confirm = useConfirm();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const noteId = useId();
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAdminData(() => loadParticipant(id), id);
  const person = data?.person;

  // Whether announcements reach them: the rule an announcement uses, for
  // their address across every booking, and whether they unsubscribed since.
  const email = person?.email ?? "";
  const { data: verdict, reload: reloadVerdict } = useAdminData(
    () => (email ? announcementVerdict(email) : Promise.resolve(undefined)),
    email
  );

  const stopAll = async () => {
    const { confirmed } = await confirm({
      title: t("admin.participant.stop_title"),
      body: t("admin.participant.stop_body"),
      confirmLabel: t("admin.participant.stop"),
    });
    if (!confirmed) return;
    try {
      await stopAnnouncements(email);
      toast.success(t("admin.participant.stopped"));
      reloadVerdict();
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Her note, saved on its own a moment after she stops typing.
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [noteState, setNoteState] = useState<NoteState>("idle");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  if (person && noteFor !== person.id) {
    setNoteFor(person.id);
    setNote(person.adminNote ?? "");
    setSavedNote(person.adminNote ?? "");
    setNoteState("idle");
  }

  useEffect(() => {
    if (!person || note === savedNote) return;
    const timer = window.setTimeout(async () => {
      setNoteState("saving");
      try {
        await saveAdminNote(person, note);
        setSavedNote(note);
        setNoteState("saved");
      } catch {
        setNoteState("failed");
      }
    }, NOTE_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [note, savedNote, person]);

  const statusLabel = (p: Participant) => t(`admin.participants.status_${p.status}`);

  /** What they paid: what Stripe charged when known, else the event's price. */
  const paidText = (p: Participant) =>
    p.amountPaid !== null ? formatPaid(p.amountPaid, p.paidCurrency, lang) : formatPrice(p.eventPrice, p.eventCurrency, lang);

  /** What the server said, in her words: Stripe's own message when Stripe refused. */
  const failureText = (failure: unknown) => {
    if (failure instanceof ParticipantActionError) {
      if (failure.code === "stripe") return t("admin.participant.stripe_failed").replace("{reason}", failure.message);
      if (failure.code === "already_registered") return t("admin.participant.details_taken");
      if (failure.code === "invalid" && failure.message.startsWith("Invalid")) return t("admin.participant.details_invalid");
    }
    return t(adminErrorKey(toAdminError(failure)));
  };

  const [editing, setEditing] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  /** Runs an action; resolves true when it went through. */
  const act = async (
    action: ParticipantAction,
    extra: { reason?: string; email?: boolean } & Partial<ParticipantDetails> = {},
    done?: string
  ): Promise<boolean> => {
    if (!person) return false;
    setBusy(true);
    try {
      const result = await participantAction(person.id, action, extra);
      if (done) toast.success(done);
      if (result.emailed === true) toast.info(t("admin.participant.email_sent"));
      if (result.emailed === false) toast.error(t("admin.participant.email_failed"));
      if (result.offered) toast.info(t("admin.waiting_list_notified").replace("{count}", String(result.offered)));
      reload();
      onChanged();
      return true;
    } catch (failure) {
      if (action === "details") setDetailsError(failureText(failure));
      else toast.error(failureText(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = async (details: ParticipantDetails) => {
    setDetailsError("");
    if (await act("details", details, t("admin.participant.details_done"))) setEditing(false);
  };

  /**
   * Returns the money: through Stripe, in full, when they paid there (the
   * dialog says how much and that it cannot be undone); otherwise she marks
   * that she returned it herself.
   */
  const refund = async () => {
    if (!person) return;
    const amount = paidText(person);
    const online = person.paidOnline;
    const { confirmed } = await confirm({
      title: online
        ? t("admin.participant.refund_stripe_title").replace("{amount}", amount)
        : t("admin.participant.refunded_title"),
      body: online ? t("admin.participant.refund_stripe_body") : t("admin.participant.refunded_body"),
      confirmLabel: online
        ? t("admin.participant.refund_stripe").replace("{amount}", amount)
        : t("admin.participant.mark_refunded"),
      tone: online ? "danger" : "default",
    });
    if (!confirmed) return;
    await act(
      "refunded",
      {},
      online ? t("admin.participant.refund_stripe_done").replace("{amount}", amount) : t("admin.participant.refunded_done")
    );
  };

  const remove = async () => {
    if (!person) return;
    const booking = person.kind === "booking";
    const { confirmed, note: reason, checked } = await confirm({
      title: t(booking ? "admin.participant.remove_booking_title" : "admin.participant.remove_waitlist_title"),
      body: (
        <>
          <span className="block font-medium text-charcoal">
            {person.fullName}, {statusLabel(person).toLowerCase()}, {person.eventTitle}
          </span>
          <span className="mt-2 block">
            {t(booking ? "admin.participant.remove_booking_body" : "admin.participant.remove_waitlist_body")}
          </span>
        </>
      ),
      confirmLabel: t(booking ? "admin.participant.remove_booking" : "admin.participant.remove_waitlist"),
      tone: "danger",
      note: { label: t("admin.participant.remove_reason"), required: true, maxLength: REMOVAL_REASON_MAX },
      checkbox: {
        label: t(booking ? "admin.participant.remove_email_booking" : "admin.participant.remove_email_waitlist"),
      },
    });
    if (!confirmed || !reason) return;
    await act(
      "remove",
      { reason, email: checked },
      t(booking ? "admin.participant.remove_booking_done" : "admin.participant.remove_waitlist_done")
    );
  };

  const close = () => dialogRef.current?.close();

  /** Closing never loses her note: one still waiting to save is saved now. */
  const handleClose = () => {
    if (person && note !== savedNote) {
      saveAdminNote(person, note).then(onChanged, () => toast.error(t("admin.participant.note_failed")));
    }
    onClose();
  };

  const section = "border-t border-sage/20 px-5 py-5 sm:px-6";
  const heading = "mb-2 font-serif text-lg text-charcoal";
  const noteDeletedOn = person ? new Date(Date.parse(person.eventEndsAt) + 30 * DAY_MS).toISOString() : "";
  const paid = person?.kind === "booking" && (person.status === "paid" || person.status === "refund_requested");
  // A booking that holds its seat can take new details: a correction, or the
  // person they gave the place to.
  const editable =
    person?.kind === "booking" &&
    !person.cancelledAt &&
    (person.status === "paid" || person.status === "free" || person.status === "refund_requested");
  const whatsapp = person ? person.phone.replace(/\D/g, "") : "";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleClose}
      onClick={(event) => {
        // A click on the <dialog> itself, not on the panel inside it, is a
        // click on the dimmed list beside it.
        if (event.target === event.currentTarget) close();
      }}
      className="admin-sheet"
    >
      <div className="flex min-h-full flex-col">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-sage/20 bg-warm-white/95 px-5 py-3 backdrop-blur-md sm:px-6">
          <p className="text-sm text-charcoal-light">{t("admin.participant.label")}</p>
          <button
            type="button"
            onClick={close}
            aria-label={t("admin.participant.close")}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {loading && !person ? (
          <div className="flex justify-center py-16" role="status">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
            <span className="sr-only">{t("admin.loading")}</span>
          </div>
        ) : error ? (
          <p role="alert" className="px-6 py-8 text-error">
            {t(adminErrorKey(error))}
          </p>
        ) : !person ? (
          <p id={titleId} className="px-6 py-8 text-charcoal-light">
            {t("admin.participant.not_found")}
          </p>
        ) : (
          <>
            <div className="px-5 pb-5 pt-5 sm:px-6">
              <h2 id={titleId} className="break-words font-serif text-2xl leading-snug text-charcoal">
                {person.fullName}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <StatusChip status={person.status} label={statusLabel(person)} />
                <Link
                  href={`/admin/events/${person.eventId}`}
                  className="min-w-0 break-words text-charcoal underline decoration-sage/50 underline-offset-2 hover:text-rose-deep"
                >
                  {person.eventTitle}, {eventDay(person.eventDate, lang)}
                </Link>
              </div>
              <p className="mt-3 text-sm text-charcoal-light">
                {t(person.kind === "booking" ? "admin.participant.booked_on" : "admin.participant.joined_waitlist")
                  .replace("{date}", longMoment(person.createdAt, lang))
                  .replace("{language}", t(`admin.participant.language_${person.locale}`))}
              </p>
              {person.offerExpiresAt && (
                <p className="mt-1 text-sm text-rose-deep">
                  {t("admin.participant.offer_until").replace("{date}", longMoment(person.offerExpiresAt, lang))}
                </p>
              )}
              {person.amountPaid !== null && (
                <p className="mt-1 text-sm text-charcoal-light">
                  {(person.discountCode ? t("admin.participant.paid_with_code") : t("admin.participant.paid_amount"))
                    .replace("{amount}", paidText(person))
                    .replace("{code}", person.discountCode ?? "")}
                </p>
              )}
              {person.cancelledAt && (
                <p className="mt-1 text-sm text-charcoal-light">
                  {t("admin.participant.cancelled_on").replace("{date}", longMoment(person.cancelledAt, lang))}
                </p>
              )}
              {person.refundRequestedAt && person.status === "refund_requested" && (
                <p className="mt-1 text-sm text-warning">
                  {t(person.cancelledAt ? "admin.participant.refund_waits" : "admin.participant.refund_requested_on").replace(
                    "{date}",
                    shortDay(person.refundRequestedAt, lang)
                  )}
                </p>
              )}
              {person.refundedAt && person.status === "refunded" && (
                <p className="mt-1 text-sm text-charcoal-light">
                  {t("admin.participant.refunded_on").replace("{date}", shortDay(person.refundedAt, lang))}
                </p>
              )}
              {person.removedAt && (
                <p className="mt-1 break-words text-sm text-charcoal-light">
                  {t("admin.participant.removed_on")
                    .replace("{date}", shortDay(person.removedAt, lang))
                    .replace("{reason}", person.removalReason ?? "")}
                </p>
              )}
              {person.refundFailedAt && (
                <div role="alert" className="mt-3 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-charcoal">
                  <p>
                    {t("admin.participant.refund_failed")
                      .replace("{date}", shortDay(person.refundFailedAt, lang))
                      .replace("{amount}", paidText(person))}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act("refund_settled", {}, t("admin.participant.refund_settled_done"))}
                    className="mt-2 min-h-10 rounded-full text-sm font-medium text-rose-deep underline decoration-rose-deep/40 underline-offset-2 hover:decoration-rose-deep disabled:opacity-50"
                  >
                    {t("admin.participant.refund_settle")}
                  </button>
                </div>
              )}
            </div>

            <section className={section} aria-labelledby={`${titleId}-contact`}>
              <h3 id={`${titleId}-contact`} className={heading}>
                {t("admin.participant.contact")}
              </h3>
              <ul className="space-y-1">
                <li>
                  <a href={`mailto:${person.email}`} className="flex min-h-10 items-center gap-3 break-all rounded-lg text-sm text-charcoal hover:text-rose-deep">
                    <Mail className="h-4 w-4 shrink-0 text-sage-deep" aria-hidden="true" />
                    <span>
                      <span className="sr-only">{t("admin.participant.email")}: </span>
                      {person.email}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`} className="flex min-h-10 items-center gap-3 rounded-lg text-sm text-charcoal hover:text-rose-deep">
                    <Phone className="h-4 w-4 shrink-0 text-sage-deep" aria-hidden="true" />
                    <span>
                      <span className="sr-only">{t("admin.participant.phone")}: </span>
                      {person.phone}
                    </span>
                  </a>
                </li>
                {whatsapp.length >= 6 && (
                  <li>
                    <a
                      href={`https://wa.me/${whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-10 items-center gap-3 rounded-lg text-sm text-charcoal hover:text-rose-deep"
                    >
                      <MessageCircle className="h-4 w-4 shrink-0 text-sage-deep" aria-hidden="true" />
                      {t("admin.participant.whatsapp")}
                    </a>
                  </li>
                )}
              </ul>
              <p className="mt-2 text-sm text-charcoal-light">
                {verdict === "unsubscribed"
                  ? t("admin.participant.unsubscribed")
                  : verdict === "included" && person.marketingConsentAt
                    ? t("admin.participant.marketing_yes").replace("{date}", shortDay(person.marketingConsentAt, lang))
                    : verdict === "included"
                      ? t("admin.participant.marketing_elsewhere")
                      : t("admin.participant.marketing_no")}
              </p>
              {verdict === "included" && (
                <button
                  type="button"
                  onClick={stopAll}
                  className="mt-1 inline-flex min-h-10 items-center rounded-full text-sm font-medium text-rose-deep underline decoration-rose-deep/40 underline-offset-2 hover:decoration-rose-deep"
                >
                  {t("admin.participant.stop")}
                </button>
              )}
            </section>

            {person.participantNote && (
              <section className={section} aria-labelledby={`${titleId}-their-note`}>
                <h3 id={`${titleId}-their-note`} className={heading}>
                  {t("admin.participant.their_note")}
                </h3>
                <blockquote className="whitespace-pre-line break-words rounded-xl bg-sage/10 px-4 py-3 text-sm leading-relaxed text-charcoal">
                  {person.participantNote}
                </blockquote>
                {person.noteConsentAt && (
                  <p className="mt-2 text-xs text-charcoal-light">
                    {t("admin.participant.note_consent")
                      .replace("{date}", longMoment(person.noteConsentAt, lang))
                      .replace("{deleted}", shortDay(noteDeletedOn, lang))}
                  </p>
                )}
              </section>
            )}

            <section className={section}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <label htmlFor={noteId} className="font-serif text-lg text-charcoal">
                  {t("admin.participant.your_note")}
                </label>
                <span
                  aria-live="polite"
                  className={cn("text-xs", noteState === "failed" ? "text-error" : "text-charcoal-light")}
                >
                  {noteState === "saving"
                    ? t("admin.participant.note_saving")
                    : noteState === "saved"
                      ? t("admin.participant.note_saved")
                      : noteState === "failed"
                        ? t("admin.participant.note_failed")
                        : ""}
                </span>
              </div>
              <textarea
                id={noteId}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={2000}
                aria-describedby={`${noteId}-hint`}
                className="w-full rounded-xl border border-sage/30 bg-white px-3 py-2 text-base text-charcoal sm:text-sm"
              />
              <p id={`${noteId}-hint`} className="mt-1 text-xs text-charcoal-light">
                {t("admin.participant.your_note_hint")}
              </p>
            </section>

            {data.history.length > 1 && (
              <section className={section} aria-labelledby={`${titleId}-history`}>
                <h3 id={`${titleId}-history`} className={heading}>
                  {t("admin.participant.history")}
                </h3>
                <p className="mb-2 text-sm text-charcoal-light">
                  {countSentence(
                    t,
                    lang,
                    "admin.participant.history_count",
                    new Set(data.history.map((h) => h.eventId)).size
                  )}
                </p>
                <ul className="divide-y divide-sage/15">
                  {data.history.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        disabled={h.id === person.id}
                        aria-current={h.id === person.id ? "true" : undefined}
                        onClick={() => onOpen(h.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg py-2 text-left text-sm text-charcoal enabled:hover:text-rose-deep disabled:cursor-default"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{h.eventTitle}</span>
                          <span className="block text-xs text-charcoal-light">
                            {eventDay(h.eventDate, lang)}
                            {h.id === person.id && `, ${t("admin.participant.history_this")}`}
                          </span>
                        </span>
                        <StatusChip status={h.status} label={statusLabel(h)} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {person.status !== "removed" && person.status !== "cancelled" && (
              <section className={cn(section, "mt-auto")} aria-labelledby={`${titleId}-actions`}>
                <h3 id={`${titleId}-actions`} className={heading}>
                  {t("admin.participant.actions")}
                </h3>
                <div className="flex flex-col items-start gap-1">
                  {paid && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={refund}
                        className="min-h-11 rounded-full px-3 text-sm font-medium text-charcoal hover:bg-sage/15 disabled:opacity-50"
                      >
                        {person.paidOnline
                          ? t("admin.participant.refund_stripe").replace("{amount}", paidText(person))
                          : t("admin.participant.mark_refunded")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          person.status === "refund_requested"
                            ? act(
                                "refund_cleared",
                                {},
                                t(person.cancelledAt ? "admin.participant.refund_declined_done" : "admin.participant.refund_cleared_done")
                              )
                            : act("refund_requested", {}, t("admin.participant.refund_requested_done"))
                        }
                        className="min-h-11 rounded-full px-3 text-sm font-medium text-charcoal hover:bg-sage/15 disabled:opacity-50"
                      >
                        {person.status === "refund_requested"
                          ? t(person.cancelledAt ? "admin.participant.decline_refund" : "admin.participant.clear_refund_requested")
                          : t("admin.participant.mark_refund_requested")}
                      </button>
                    </>
                  )}
                  {editable && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setDetailsError("");
                        setEditing(true);
                      }}
                      className="min-h-11 rounded-full px-3 text-sm font-medium text-charcoal hover:bg-sage/15 disabled:opacity-50"
                    >
                      {t("admin.participant.details_edit")}
                    </button>
                  )}
                  {!person.cancelledAt && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={remove}
                      className="min-h-11 rounded-full px-3 text-sm font-medium text-error hover:bg-error/10 disabled:opacity-50"
                    >
                      {t(person.kind === "booking" ? "admin.participant.remove_booking" : "admin.participant.remove_waitlist")}
                    </button>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {editing && person && (
        <DetailsDialog
          initial={{ fullName: person.fullName, email: person.email, phone: person.phone }}
          busy={busy}
          error={detailsError}
          onSave={saveDetails}
          onClose={() => setEditing(false)}
        />
      )}
    </dialog>
  );
}
