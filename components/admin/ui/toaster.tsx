"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { cn } from "@/lib/utils";

/**
 * Short messages that confirm an action ("Salvat") or explain a failure, shown
 * in the corner of the admin panel. They replace `alert()`, which blocks the
 * whole page and looks like a browser fault.
 *
 * Success and information messages disappear after a few seconds. Errors stay
 * until closed, so there is always time to read what went wrong.
 *
 * Screen readers hear each message through two live regions that are always in
 * the page (a polite one, and an assertive one for errors). A live region added
 * at the same moment as its text is often not announced, which is why the
 * announcement is separate from the visible list.
 */

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** An optional link, such as "Vezi articolul" after publishing. */
  action?: { label: string; href: string; external?: boolean };
}

type ShowToast = (message: string, action?: Toast["action"]) => void;

interface ToastApi {
  success: ShowToast;
  error: ShowToast;
  info: ShowToast;
}

const ToastContext = createContext<ToastApi | null>(null);

/** How long a success or information message stays, in milliseconds. */
const AUTO_DISMISS_MS = 5000;

const TONE = {
  success: { icon: CheckCircle2, className: "text-success" },
  error: { icon: AlertCircle, className: "text-error" },
  info: { icon: Info, className: "text-sage-deep" },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useAdminLocale();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [announcement, setAnnouncement] = useState({ polite: "", assertive: "" });
  const nextId = useRef(1);
  const regionRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, action?: Toast["action"]) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { id, tone, message, action }]);
      setAnnouncement((current) =>
        tone === "error" ? { ...current, assertive: message } : { ...current, polite: message }
      );
      if (tone !== "error") window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, action) => push("success", message, action),
      error: (message, action) => push("error", message, action),
      info: (message, action) => push("info", message, action),
    }),
    [push]
  );

  // The list is a manual popover so it sits in the browser's top layer, above
  // an open dialog. Showing it again after each change moves it to the front.
  useEffect(() => {
    const region = regionRef.current;
    if (!region || typeof region.showPopover !== "function") return;
    const open = region.matches(":popover-open");
    if (toasts.length) {
      if (open) region.hidePopover();
      region.showPopover();
    } else if (open) {
      region.hidePopover();
    }
  }, [toasts]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div aria-live="polite" className="sr-only">
        {announcement.polite}
      </div>
      <div aria-live="assertive" className="sr-only">
        {announcement.assertive}
      </div>

      <div
        ref={regionRef}
        popover="manual"
        role="region"
        aria-label={t("admin.toast.region")}
        className="admin-toasts"
      >
        <ul className="flex flex-col gap-2">
          {toasts.map((toast) => {
            const { icon: Icon, className } = TONE[toast.tone];
            return (
              <li
                key={toast.id}
                className="admin-toast flex items-start gap-3 rounded-xl border border-sage/25 bg-white px-4 py-3 text-sm text-charcoal shadow-lg shadow-black/10"
              >
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", className)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="break-words">{toast.message}</p>
                  {toast.action && (
                    <Link
                      href={toast.action.href}
                      target={toast.action.external ? "_blank" : undefined}
                      rel={toast.action.external ? "noopener" : undefined}
                      className="mt-1 inline-block font-medium text-rose-deep underline-offset-2 hover:underline"
                    >
                      {toast.action.label}
                    </Link>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label={t("admin.toast.close")}
                  className="-mr-1 -mt-1 rounded-full p-1 text-charcoal-light hover:bg-sage/10 hover:text-charcoal"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </ToastContext.Provider>
  );
}

/** Shows a message in the admin's corner: `toast.success(t("admin.toast.saved"))`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}
