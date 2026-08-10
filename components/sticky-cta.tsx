"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/** How long the page must be still before the bar comes back, in ms. */
const SCROLL_IDLE_MS = 200;

/**
 * The floating "book now" bar on the phone home page.
 *
 * It appears only when all three of these hold:
 *
 *   1. there is an upcoming event with seats left — otherwise it sends people
 *      to a section that has nothing to sell them;
 *   2. the hero's own call to action has scrolled out of view — while that is
 *      still on screen this would be a duplicate of a button the visitor is
 *      already looking at;
 *   3. the page is not currently moving.
 *
 * The third condition is the unusual one and it is deliberate. On a phone this
 * bar covers the bottom of the screen, which is where the content someone is
 * scrolling towards keeps arriving. Hiding it during the scroll itself gives
 * the reader the whole viewport, and it slides back up the moment they stop —
 * which is also the moment they might want to act on what they just read.
 */
export function StickyCta() {
  const locale = useLocale();
  const [hasOpenEvents, setHasOpenEvents] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Condition 1: is there anything to book?
   *
   * This used to take `.limit(1)` with no `order`, then decide from that single
   * row. Two things were wrong with it. Without an ORDER BY, Postgres may
   * return any upcoming event, not the next one — so a sold-out event could
   * answer for all the others and hide the bar while seats were going spare
   * elsewhere. And `.single()` errors rather than returning null when the
   * availability row is missing, which would leave the bar permanently off.
   *
   * It now asks the real question: does *any* upcoming event still have room?
   */
  useEffect(() => {
    const supabase = createClient();
    const today = new Date().toISOString().split("T")[0];

    const load = async () => {
      const { data: events } = await supabase
        .from("events")
        .select("id, max_participants")
        .eq("published", true)
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(20);

      if (!events?.length) return;

      // No cap means there is always room; no need to count anything.
      if (events.some((event) => event.max_participants == null)) {
        setHasOpenEvents(true);
        return;
      }

      // Seat counts come from the aggregate view — see the event detail page
      // for why the registrations table itself cannot be counted from the
      // browser. A missing row means nobody has registered yet, hence `?? 0`.
      const { data: availability } = await supabase
        .from("event_availability")
        .select("event_id, taken")
        .in("event_id", events.map((event) => event.id));

      const taken = new Map((availability ?? []).map((row) => [row.event_id, row.taken]));
      setHasOpenEvents(
        events.some((event) => (taken.get(event.id) ?? 0) < event.max_participants!)
      );
    };

    load();
  }, []);

  /**
   * Condition 2: has the hero's call to action gone past?
   *
   * An IntersectionObserver on the marker the home page renders below those
   * buttons, rather than a scroll handler comparing pixel offsets. The browser
   * does this work off the main thread and only calls back when the answer
   * changes, so it costs nothing during a scroll — and there is no magic number
   * to go stale when the headline wraps differently or the photo loads.
   *
   * `boundingClientRect.top < 0` distinguishes scrolled *past* the marker from
   * not yet scrolled *to* it: both are "not intersecting", but only the first
   * should reveal the bar.
   */
  useEffect(() => {
    const sentinel = document.getElementById("hero-cta-end");
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setPastHero(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  /**
   * Condition 3: is the page moving?
   *
   * There is no "scroll ended" event in any browser Safari included, so this is
   * the standard shape: every scroll event marks us as moving and restarts a
   * short timer; the page counts as still once the timer survives to fire.
   *
   * `passive: true` promises the listener will not call preventDefault, which
   * lets the browser start scrolling without waiting for this to run. On a
   * touch device a non-passive scroll listener is a well-known cause of the
   * first swipe feeling sticky.
   */
  useEffect(() => {
    const onScroll = () => {
      setScrolling(true);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setScrolling(false), SCROLL_IDLE_MS);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  if (!hasOpenEvents) return null;

  const visible = pastHero && !scrolling;
  const text = locale === "ro" ? "Înscrie-te acum" : "Book now";

  return (
    <>
      {/*
       * A spacer the same height as the fixed bar.
       *
       * The bar is position:fixed, so it sits outside the document flow and
       * covers whatever is at the bottom of the page — in practice the footer,
       * with its contact and social links. Rendering a matching spacer here
       * gives the page something to scroll past.
       *
       * It stays in place whether or not the bar is currently on screen. Adding
       * and removing 80px of page height as someone scrolls would move the
       * content under their thumb, which is a far worse problem than a little
       * extra space above the footer.
       */}
      <div aria-hidden="true" className="h-20 lg:hidden" />

      <div
        /*
         * Slid out of frame rather than unmounted, so both directions animate.
         * `pointer-events-none` stops the hidden bar swallowing taps aimed at
         * the content behind it, and `inert` takes it out of the tab order and
         * the accessibility tree — a button nobody can see should not be
         * reachable by keyboard or announced by a screen reader.
         */
        inert={!visible}
        className={`fixed bottom-0 left-0 right-0 z-50 border-t border-sage/20 bg-white/90 px-4 py-3 shadow-lg backdrop-blur-md transition-all duration-300 motion-reduce:transition-none lg:hidden ${
          visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
        data-visible={visible ? "true" : "false"}
      >
        <Button
          className="w-full"
          size="lg"
          onClick={() => {
            document.getElementById("events")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          {text}
        </Button>
      </div>
    </>
  );
}
