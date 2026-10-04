"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp } from "lucide-react";

/**
 * "Înapoi sus": a round button in the bottom corner once the first screen of
 * the page has scrolled away. On a page shorter than that it never appears.
 *
 * The header already does this on the home page (its name scrolls up there),
 * but everywhere else the name goes home, and a long article or event page
 * needs a way back to its own top (Rares, 24 September 2026).
 *
 * WHEN IT SHOWS
 *
 * A marker sits one screen below the top of the page, and an
 * IntersectionObserver reports when it has passed above the screen. No scroll
 * listener: the browser does the watching. Past that point it comes and goes
 * with the top bar, which hides while the page is read downwards and returns
 * when it is scrolled up (app/globals.css, "BACK TO TOP").
 *
 * WHAT IT DOES
 *
 * Scrolls to the top, smoothly unless the visitor asked for less motion, and
 * moves keyboard focus to the start of the page's content, like the "Sari la
 * conținut" link does. Focus cannot stay on the button, which is about to
 * fade out.
 */
export function BackToTop() {
  const t = useTranslations("nav");
  const markerRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const observer = new IntersectionObserver(([entry]) => {
      // Above the screen, not merely off it: below the screen is where it
      // starts on every page that has not been scrolled yet.
      setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(marker);
    return () => observer.disconnect();
  }, []);

  const toTop = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    document.getElementById("main-content")?.focus({ preventScroll: true });
  };

  return (
    <>
      <div ref={markerRef} className="back-to-top-marker" aria-hidden="true" />
      {/* Hidden with `visibility` (app/globals.css), which also takes it out of
          the keyboard's reach and out of what a screen reader offers. Not
          `inert`: the phone menu clears that from the whole page when it
          closes (components/layout/header.tsx). */}
      <button
        type="button"
        onClick={toTop}
        data-shown={shown ? "" : undefined}
        aria-label={t("back_to_top")}
        data-tooltip={t("back_to_top")}
        data-tooltip-left
        className="back-to-top"
      >
        <ArrowUp className="h-5 w-5" aria-hidden="true" />
      </button>
    </>
  );
}
