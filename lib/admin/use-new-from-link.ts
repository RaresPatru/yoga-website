"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Whether the page was opened with `?new=1`, which is how the dashboard's
 * "Eveniment nou" and "Articol nou" buttons ask the events and blog pages to
 * open an empty form. Read it as the form's initial state.
 *
 * The parameter is taken out of the address as soon as it has been read, so
 * reloading the page afterwards shows the list rather than a fresh empty form.
 * Next.js keeps its router in step with `history.replaceState`.
 *
 * A stopgap until the editors get their own addresses (`/admin/events/new`,
 * `/admin/blog/new`) in phases 3 and 4 of docs/OVERHAUL.md.
 */
export function useNewFromLink(): boolean {
  const params = useSearchParams();
  const pathname = usePathname();
  const requested = params.get("new") === "1";

  useEffect(() => {
    if (requested) window.history.replaceState(null, "", pathname);
  }, [requested, pathname]);

  return requested;
}
