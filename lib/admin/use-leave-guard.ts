"use client";

import { useCallback, useEffect, useEffectEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Asks before leaving a form with unsaved changes.
 *
 * Two ways out are covered:
 *
 * - Closing the tab, reloading or typing another address: the browser's own
 *   "Leave site?" prompt, through `beforeunload`. Browsers show their own
 *   wording; a page can only ask for the prompt, not write it.
 * - Clicking a link inside the admin (the sidebar, the section menu): the
 *   click is caught before Next.js sees it, `confirmLeave` asks in the admin's
 *   own dialog, and the navigation goes ahead only if she agrees. The listener
 *   sits on the document in the capture phase, so it runs before React's.
 *
 * The browser's back button is not covered: the App Router gives no way to
 * hold a history navigation, and her typing survives in the page until she
 * reloads.
 *
 * Returns `guardedPush`, for navigations the page starts itself (the section
 * dropdown on a phone).
 */
export function useLeaveGuard(dirty: boolean, confirmLeave: () => Promise<boolean>) {
  const router = useRouter();
  const ask = useEffectEvent(confirmLeave);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older engines, WebKit included, still want this set.
      event.returnValue = "";
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || !anchor.href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // A link to this same page (such as the skip link) is not leaving.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      event.preventDefault();
      event.stopPropagation();
      void ask().then((leave) => {
        if (leave) router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, router]);

  return useCallback(
    async (href: string) => {
      if (dirty && !(await confirmLeave())) return;
      router.push(href);
    },
    [dirty, confirmLeave, router]
  );
}
