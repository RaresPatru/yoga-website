"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lotus } from "@/components/layout/lotus";

/**
 * What a tap on a link looks like while the next page is on its way.
 *
 * Every page is built on the server when it is asked for, so a tap waits for
 * that before anything changes. Waiting on a screen that has not moved, people
 * tap again, or tap something else. So once a link is followed:
 *
 *   - after 150 ms, if the page has not arrived, a layer washes the page pale
 *     and takes the taps meant for it;
 *   - at 450 ms a turning lotus says the page is on its way;
 *   - the moment the new address is showing, it is gone.
 *
 * The timing is CSS (app/globals.css, "THE LOTUS AND THE VEIL"); this only
 * says when a page is pending. A quick page never shows any of it, and until
 * the layer shows, the page under it answers as usual, so a hover does not
 * drop the moment a card is clicked. The top bar stays above the layer, so
 * choosing somewhere else is still one tap away: the newer choice wins.
 *
 * WHICH TAPS COUNT
 *
 * Only a link Next.js is taking over, which it signals by cancelling the
 * click's default. A link it leaves to the browser (a download, another
 * site, a new tab, a modified click) loads the ordinary way, with the
 * browser's own progress bar, and a link to the same page is only a jump.
 *
 * BACK AND FORWARD
 *
 * The page transitions (app/globals.css, "PAGE TRANSITIONS") are for links
 * followed on the page. On the back and forward buttons, and above all on an
 * iPhone's swipe back, the browser has already shown the other page by the
 * time the site hears of it; playing a fade after that shows the page being
 * left for a moment, then fades back. `data-history-nav` on <html> switches
 * the transitions off until the next thing the visitor does.
 */

/** How long the page stays covered, at most, if the new one never arrives. */
const GIVE_UP_MS = 10_000;

type Pending = { key: string } | null;

function currentAddress(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function Veil() {
  const t = useTranslations("common");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<Pending>(null);

  // A new address means the page has arrived.
  const address = `${pathname}?${searchParams?.toString() ?? ""}`;
  const [shownFor, setShownFor] = useState(address);
  if (shownFor !== address) {
    setShownFor(address);
    setPending(null);
  }

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== "_self") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (`${url.pathname}${url.search}` === currentAddress()) return;
      setPending({ key: `${url.pathname}${url.search}` });
    };
    // Back from the browser's memory of this page (the back button after
    // leaving the site): nothing is on its way any more.
    const onPageShow = () => setPending(null);
    // Bubbling on window runs after React's own handlers, including the one
    // inside next/link that cancels the default.
    window.addEventListener("click", onClick);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(null), GIVE_UP_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return (
    <div className="nav-veil" data-pending={pending ? "" : undefined} aria-hidden={pending ? undefined : true}>
      {pending && (
        <div role="status" className="nav-veil-lotus">
          <Lotus className="h-14 w-14" />
          <span className="sr-only">{t("loading_page")}</span>
        </div>
      )}
    </div>
  );
}

/** Marks back and forward navigations, which the page transitions leave alone. */
function useHistoryNavigationMark() {
  useEffect(() => {
    const root = document.documentElement;
    const mark = () => root.setAttribute("data-history-nav", "");
    const clear = () => root.removeAttribute("data-history-nav");
    window.addEventListener("popstate", mark);
    window.addEventListener("pointerdown", clear, { capture: true });
    window.addEventListener("keydown", clear, { capture: true });
    return () => {
      window.removeEventListener("popstate", mark);
      window.removeEventListener("pointerdown", clear, { capture: true });
      window.removeEventListener("keydown", clear, { capture: true });
    };
  }, []);
}

export function NavigationFeedback() {
  useHistoryNavigationMark();
  return (
    // useSearchParams() needs a boundary, and it wraps this alone: around the
    // page it would cost missing pages their 404 (CLAUDE.md).
    <Suspense fallback={null}>
      <Veil />
    </Suspense>
  );
}
