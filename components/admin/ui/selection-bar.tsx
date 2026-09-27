"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";

/**
 * The bar that appears at the bottom of a list once something is ticked: how
 * many, what can be done to them, and a way to untick everything.
 *
 * At the bottom, where a thumb reaches on a phone, and fixed there so it stays
 * in view while she scrolls through a long list ticking rows. It is a toolbar
 * of ordinary buttons, announced politely when the count changes.
 */
export function SelectionBar({ count, children, onClear }: { count: number; children: ReactNode; onClear: () => void }) {
  const { t } = useAdminLocale();
  if (count === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label={t("admin.selection.bar")}
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pl-(--admin-rail-width)"
    >
      <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-3xl border border-sage/25 bg-warm-white/95 p-1.5 pl-4 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.3)] backdrop-blur-md">
        <p className="mr-1 text-sm font-medium tabular-nums text-charcoal" aria-live="polite">
          {t("admin.selection.count").replace("{count}", String(count))}
        </p>
        {children}
        <button
          type="button"
          onClick={onClear}
          aria-label={t("admin.selection.clear")}
          data-tooltip={t("admin.selection.clear")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** A button for the bar: plain, or red for something that cannot be undone. */
export const selectionButton = (danger = false) =>
  danger
    ? "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-error hover:bg-error/10 disabled:opacity-50"
    : "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-charcoal hover:bg-sage/15 disabled:opacity-50";
