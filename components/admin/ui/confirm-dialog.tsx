"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { cn } from "@/lib/utils";

/**
 * A confirmation question in the admin's own style, replacing
 * `window.confirm()`.
 *
 *     const confirm = useConfirm();
 *     const { confirmed } = await confirm({
 *       title: "Ștergi articolul?",
 *       body: "Nu poate fi recuperat.",
 *       confirmLabel: "Șterge",
 *       tone: "danger",
 *     });
 *
 * It is a native <dialog> opened with showModal(), so the browser traps focus
 * inside it, makes the page behind it inert, and closes it on Escape. A click on
 * the dimmed backdrop cancels too. For a destructive question, focus starts on
 * Cancel, so an accidental Enter never deletes anything.
 *
 * `note` adds a text box to the question (the reason for removing a
 * participant, for example); what was typed comes back with the answer.
 */

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" colours the confirm button red and focuses Cancel first. */
  tone?: "danger" | "default";
  note?: { label: string; placeholder?: string; required?: boolean; maxLength?: number };
}

export interface ConfirmResult {
  confirmed: boolean;
  note: string;
}

type Confirm = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<Confirm | null>(null);

interface Pending {
  options: ConfirmOptions;
  resolve: (result: ConfirmResult) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useAdminLocale();
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const noteId = useId();

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<ConfirmResult>((resolve) => {
        setNote("");
        setPending({ options, resolve });
      }),
    []
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (pending && dialog && !dialog.open) dialog.showModal();
  }, [pending]);

  // Every way of closing (a button, Escape, the backdrop) ends here. The
  // confirm button submits the form with value "confirm", which becomes the
  // dialog's returnValue; anything else counts as cancelling.
  const handleClose = () => {
    const dialog = dialogRef.current;
    if (!pending || !dialog) return;
    pending.resolve({ confirmed: dialog.returnValue === "confirm", note: note.trim() });
    dialog.returnValue = "";
    setPending(null);
  };

  const options = pending?.options;
  const danger = options?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={options?.body ? bodyId : undefined}
        onClose={handleClose}
        onClick={(event) => {
          // A click that lands on the <dialog> itself, not on the panel inside
          // it, is a click on the dimmed backdrop.
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-transparent p-0 backdrop:bg-black/40"
      >
        {options && (
          <form
            method="dialog"
            className="rounded-2xl border border-white/30 bg-white/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            <h2 id={titleId} className="font-serif text-xl text-charcoal">
              {options.title}
            </h2>
            {options.body && (
              <div id={bodyId} className="mt-2 text-sm leading-relaxed text-charcoal-light">
                {options.body}
              </div>
            )}

            {options.note && (
              <div className="mt-4">
                <label htmlFor={noteId} className="text-sm font-medium text-charcoal">
                  {options.note.label}
                </label>
                <textarea
                  id={noteId}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={options.note.placeholder}
                  required={options.note.required}
                  maxLength={options.note.maxLength ?? 500}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-sage/30 bg-white px-3 py-2 text-base text-charcoal focus:border-rose-deep focus:outline-none"
                />
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="submit"
                value="cancel"
                autoFocus={danger}
                formNoValidate
                className="h-11 rounded-full px-5 text-sm font-medium text-charcoal-light hover:bg-sage/10 hover:text-charcoal"
              >
                {options.cancelLabel ?? t("admin.cancel")}
              </button>
              <button
                type="submit"
                value="confirm"
                autoFocus={!danger}
                className={cn(
                  "h-11 rounded-full px-5 text-sm font-medium text-white shadow-sm",
                  danger ? "bg-error hover:bg-error/90" : "bg-rose-deep hover:bg-rose-deeper"
                )}
              >
                {options.confirmLabel}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

/** Asks a yes/no question in a dialog and resolves with the answer. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return confirm;
}
