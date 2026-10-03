"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAdminLocale } from "@/components/admin/locale-provider";
import type { ParticipantDetails } from "@/lib/admin/participant-actions";

/**
 * New name, email and phone for a booking: a correction, or the person
 * someone gave their place to (the terms say a place can be passed on through
 * her). Laid out like the admin's confirmation dialog, which it sits beside:
 * a native modal <dialog>, so the browser keeps focus inside and Escape
 * closes it.
 *
 * The server checks the details by the booking form's rules and refuses an
 * address that already has a seat on the event; `error` shows what it said,
 * and the dialog stays open with what she typed.
 */
export function DetailsDialog({
  initial,
  busy,
  error,
  onSave,
  onClose,
}: {
  initial: { fullName: string; email: string; phone: string };
  busy: boolean;
  error: string;
  onSave: (details: ParticipantDetails) => void;
  onClose: () => void;
}) {
  const { t } = useAdminLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ids = useId();
  const [fullName, setFullName] = useState(initial.fullName);
  const [emailAddress, setEmailAddress] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [sendConfirmation, setSendConfirmation] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const field = "mt-1 w-full rounded-xl border border-sage/30 bg-white px-3 py-2 text-base text-charcoal focus:border-rose-deep focus:outline-none";
  const label = "text-sm font-medium text-charcoal";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${ids}-title`}
      aria-describedby={`${ids}-body`}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-transparent p-0 backdrop:bg-black/40"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ fullName, emailAddress, phone, sendConfirmation });
        }}
        className="rounded-2xl border border-white/30 bg-white/95 p-6 shadow-2xl backdrop-blur-xl"
      >
        <h2 id={`${ids}-title`} className="font-serif text-xl text-charcoal">
          {t("admin.participant.details_title")}
        </h2>
        <p id={`${ids}-body`} className="mt-2 text-sm leading-relaxed text-charcoal-light">
          {t("admin.participant.details_body")}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor={`${ids}-name`} className={label}>
              {t("admin.participant.details_name")}
            </label>
            <input
              id={`${ids}-name`}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="off"
              required
              minLength={2}
              maxLength={100}
              className={field}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-email`} className={label}>
              {t("admin.participant.details_email")}
            </label>
            <input
              id={`${ids}-email`}
              type="email"
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              autoComplete="off"
              required
              maxLength={254}
              className={field}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-phone`} className={label}>
              {t("admin.participant.details_phone")}
            </label>
            <input
              id={`${ids}-phone`}
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="off"
              required
              className={field}
            />
          </div>
        </div>

        <Checkbox
          className="mt-4"
          label={t("admin.participant.details_send")}
          checked={sendConfirmation}
          onChange={(event) => setSendConfirmation(event.target.checked)}
        />

        {error && (
          <p role="alert" className="mt-4 text-sm text-error">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="h-11 rounded-full px-5 text-sm font-medium text-charcoal-light hover:bg-sage/10 hover:text-charcoal"
          >
            {t("admin.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-full bg-rose-deep px-5 text-sm font-medium text-white shadow-sm hover:bg-rose-deeper disabled:opacity-50"
          >
            {busy ? t("admin.saving") : t("admin.participant.details_save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
