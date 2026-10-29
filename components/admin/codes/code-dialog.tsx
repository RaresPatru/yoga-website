"use client";

import { useEffect, useId, useRef } from "react";
import { formOf, type NewPromotionCode, type PromotionCodeView } from "@/lib/promotion-codes";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { CodeForm } from "@/components/admin/codes/code-form";

/**
 * Editing a code: its form in a native modal <dialog>, laid out like the
 * admin's other dialogs (components/admin/participants/details-dialog.tsx),
 * so the browser keeps focus inside and Escape closes it.
 *
 * Unlike those, a click beside it does not close it: this one holds changes
 * she has typed, and losing them to a stray tap on a phone is the likelier
 * accident. Escape and Renunță still do.
 *
 * Saving may first ask her to confirm (the page decides: a code people
 * received by email, or a word that was emailed before), in the admin's
 * confirmation dialog, which opens above this one and comes back to it.
 */
export function CodeDialog({
  code,
  today,
  expired,
  busy,
  error,
  onSave,
  onClose,
}: {
  code: PromotionCodeView;
  today?: string;
  expired: boolean;
  busy: boolean;
  error: string;
  onSave: (input: NewPromotionCode) => void;
  onClose: () => void;
}) {
  const { t } = useAdminLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ids = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${ids}-title`}
      aria-describedby={`${ids}-body`}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-2xl bg-transparent p-0 backdrop:bg-black/40"
    >
      <div className="rounded-2xl border border-white/30 bg-white/95 p-6 shadow-2xl backdrop-blur-xl">
        <h2 id={`${ids}-title`} className="font-serif text-xl text-charcoal">
          {t("admin.discounts.edit_title").replace("{code}", code.code)}
        </h2>
        <p id={`${ids}-body`} className="mb-5 mt-2 text-sm leading-relaxed text-charcoal-light">
          {t("admin.discounts.edit_intro")}
        </p>
        <CodeForm
          initial={formOf(code)}
          today={today}
          usedSoFar={code.timesRedeemed}
          expired={expired}
          error={error}
          onSubmit={onSave}
          footer={
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
                {busy ? t("admin.saving") : t("admin.discounts.save")}
              </button>
            </div>
          }
        />
      </div>
    </dialog>
  );
}
