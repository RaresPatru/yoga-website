"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * The home page's event carousel: one card at a time, swipe on a phone, arrows
 * and arrow keys on a desktop.
 *
 * WHAT IT DOES NOT DO, AND WHY THAT IS THE DESIGN
 *
 * It does not move the cards. The cards are `<li>` children rendered on the
 * server and handed in; this component renders the scroll container around them
 * and calls `scrollTo` on it. Everything that makes a swipe feel native —
 * momentum, the rubber band at the ends, the way a half-swipe settles — is the
 * browser's, and the browser is better at it than any listener would be. It is
 * also the version that survives the engine our visitors actually use:
 * CLAUDE.md records scroll-driven animations reporting support in WebKit and
 * then refusing to interpolate, so anything built on those would have looked
 * fine in Chrome and moved in one jump on an iPhone.
 *
 * The geometry lives in `.event-carousel-track` in app/globals.css.
 *
 * IT DOES NOT WRAP AROUND
 *
 * The first slide is the event worth booking soonest, and the order behind it
 * is meaningful — bookable dates by how close they are, then the full ones. So
 * there is a beginning: at the first card the back arrow is disabled and a
 * rightward swipe rubber-bands. Looping would make the order a circle, and a
 * circle has no first.
 *
 * ONE WAY OF KNOWING WHERE IT IS
 *
 * `scrollsnapchange` would answer that natively and is Chrome-only; so are
 * container scroll-state queries. Rather than carry both paths, this uses the
 * one that works everywhere — the `scroll` listener read inside
 * `requestAnimationFrame` that the guidance recommends as the fallback, which
 * also tracks programmatic scrolls for free because `scrollTo` fires `scroll`
 * events the whole way.
 */
export function EventCarousel({
  count,
  listLabel,
  previousLabel,
  nextLabel,
  positionLabel,
  children,
}: {
  count: number;
  /** Names the list for a screen reader, e.g. "Evenimente viitoare". */
  listLabel: string;
  previousLabel: string;
  nextLabel: string;
  /** "Evenimentul {n} din {total}" — interpolated below, not by next-intl. */
  positionLabel: string;
  children: React.ReactNode;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  /** Where it looks like it is. Drives the dots and the announcement. */
  const [index, setIndex] = useState(0);

  /**
   * Which card it is heading for. Drives the two arrows.
   *
   * The arrows describe what pressing them would do next, so they answer to the
   * destination rather than to the scroll position: once the last card has been
   * asked for, pressing forward again does nothing, and an enabled control that
   * does nothing is worse than a disabled one. The dots answer to the position,
   * because that is what they are drawing.
   */
  const [target, setTarget] = useState(0);

  /**
   * Where it has been *asked* to go, which during a glide is not where it is.
   *
   * Two clicks on the forward arrow in quick succession have to land two cards
   * along. Composing them from the live position instead meant the second click
   * read a scroll that was still somewhere between cards, rounded it back to the
   * card it had just left, and asked to go where it was already going: four fast
   * clicks moved two cards. Which is exactly what someone does when they are
   * skimming for a date that suits them.
   */
  const targetRef = useRef(0);

  /**
   * Whether a scroll we asked for is still on its way there.
   *
   * It is what separates "the glide has not reached card four yet" from "a
   * finger put this on card two", which look identical from the scroll position
   * alone. Cleared when the scroll arrives, and when somebody takes hold of the
   * carousel themselves — a touch on it outranks anything we were in the middle
   * of doing.
   */
  const glidingRef = useRef(false);

  /** Which arrow should take focus once the arrows have re-rendered, if either. */
  const handoverRef = useRef<"previous" | "next" | null>(null);

  /**
   * Which card is showing, from the scroll position.
   *
   * Every snap stop is exactly `index * step` because `scroll-padding-inline`
   * on the track matches its inline padding — the reasoning is in
   * app/globals.css, and it is what lets both directions of this be arithmetic
   * rather than a search.
   *
   * `settled` is the difference between the two numbers above. A glide fires
   * scroll events the whole way, and adopting those as the target would throw
   * away whatever the person queued up while it was moving.
   *
   * WHY "STOPPED" IS NOT THE TEST, AND "ARRIVED" IS
   *
   * Stopped is a timer, and a timer cannot tell a finished scroll from a
   * starved one — or from one that has not begun. Measured under a Playwright
   * trace, which throttles the page about as hard as a mid-range phone does:
   * four clicks over 423ms moved the scroll eighteen pixels, the quiet between
   * frames outlasted the timer, and the target was reset to the card it was
   * still sitting on. Four taps went one card.
   *
   * So the position is only adopted when it is somewhere nobody is on their way
   * from: either it is exactly where the last click asked for, or no click is
   * outstanding and a finger put it there.
   */
  const read = useCallback(
    (settled: boolean) => {
      const track = trackRef.current;
      if (!track) return;

      const step = stepOf(track);
      if (!step) return; // display:none, or not laid out yet

      const at = Math.min(count - 1, Math.max(0, Math.round(track.scrollLeft / step)));
      setIndex(at);
      if (!settled) return;

      if (at === targetRef.current) {
        glidingRef.current = false; // arrived
      } else if (!glidingRef.current) {
        // Swiped, restored by the back button, or resized into place.
        targetRef.current = at;
        setTarget(at);
      }
    },
    [count]
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;

    const stopped = () => {
      clearTimeout(settle);
      read(true);
    };

    const moving = () => {
      // Coalesce to one read per frame: a swipe fires scroll events far faster
      // than the screen refreshes, and each read measures layout.
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          read(false);
        });
      }
      // The belt to `scrollend`'s braces. Safari only shipped that event in
      // 18.2, so on an older iPhone a swipe that coasts to a stop would
      // otherwise leave the dots on whatever the last frame said.
      clearTimeout(settle);
      settle = setTimeout(stopped, 120);
    };

    // Taking hold of the carousel cancels whatever we were in the middle of:
    // wherever the finger leaves it is now the place to count from.
    const takeOver = () => {
      glidingRef.current = false;
    };

    track.addEventListener("scroll", moving, { passive: true });
    track.addEventListener("scrollend", stopped);
    track.addEventListener("pointerdown", takeOver, { passive: true });
    track.addEventListener("wheel", takeOver, { passive: true });
    // The slide width changes with the viewport, and so does the arithmetic.
    window.addEventListener("resize", stopped);

    // Once on mount: a position restored by the back button fires no scroll
    // event, and neither does a carousel that nobody has touched.
    read(true);

    return () => {
      track.removeEventListener("scroll", moving);
      track.removeEventListener("scrollend", stopped);
      track.removeEventListener("pointerdown", takeOver);
      track.removeEventListener("wheel", takeOver);
      window.removeEventListener("resize", stopped);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [read]);

  /**
   * The track is as tall as the card showing, and eases between the two.
   *
   * Flex makes a row as tall as its tallest item, so a short card — an event
   * with no photograph — left a stretch of empty track beneath it until the
   * next slide happened to be tall. Sizing the scrollport to the current slide
   * removes that, at the cost of the section changing height as you move
   * through it, which the CSS transition turns from a jump into a settle.
   *
   * WHY THE HEIGHT IS SET HERE RATHER THAN IN CSS
   *
   * There is no CSS for "as tall as the nth child". `height` on the track is,
   * and it has to be computed: the track is `border-box`, so the number
   * includes its own padding — read from the computed style rather than
   * written down, because that padding is tuned to the card's shadow and will
   * be tuned again.
   *
   * A `ResizeObserver` per slide rather than a resize listener. The height
   * changes for reasons the window never hears about: a photograph decoding, a
   * web font swapping in and reflowing a description from three lines to four.
   * Watching the slides catches all of it, including the viewport resize.
   *
   * `useLayoutEffect` so the first measurement lands before the browser paints
   * — otherwise the carousel draws at the tallest card's height and then snaps,
   * which is a layout shift on every load. The first assignment does not
   * animate either way, because `auto` is not a length CSS can interpolate
   * from; only the card-to-card changes after it do.
   */
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    /*
     * Only while the cards are stacked. `48rem` is Tailwind's `md`, where
     * `.event-carousel-track` goes back to `align-items: stretch` — in rem
     * rather than px so it moves with the root font size exactly as the CSS
     * does.
     *
     * ABOVE IT THIS MUST NOT RUN AT ALL, AND THAT IS THE WHOLE POINT
     *
     * Stretching means each slide takes its height *from the track*. Setting
     * the track's height *from a slide* on top of that is circular: whatever
     * number goes in, the slide grows to it, the observer measures the same
     * number back, and it sets. Dragging a window narrow and wide again left
     * the wide layout wearing the narrow layout's height — a card twice as
     * tall as its contents with everything floating in the middle of it, until
     * a reload cleared the inline style.
     *
     * So above `md` the inline height is removed and flex is left to do what it
     * was already doing correctly before any of this existed.
     */
    const stacked = window.matchMedia("(max-width: 47.999rem)");

    const fit = () => {
      if (!stacked.matches) {
        track.style.height = "";
        return;
      }
      const slide = track.children[index] as HTMLElement | undefined;
      if (!slide) return;
      const style = getComputedStyle(track);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      track.style.height = `${slide.offsetHeight + padding}px`;
    };

    fit();
    const observer = new ResizeObserver(fit);
    for (const slide of track.children) observer.observe(slide);
    // The observer catches a slide changing size, but not the breakpoint being
    // crossed by a window that happens to leave the slides the same height.
    stacked.addEventListener("change", fit);
    return () => {
      observer.disconnect();
      stacked.removeEventListener("change", fit);
    };
  }, [index, count]);

  /** One card along, in either direction. Never past either end. */
  const move = useCallback(
    (delta: number) => {
      const track = trackRef.current;
      if (!track) return;

      const step = stepOf(track);
      if (!step) return;

      const to = Math.min(count - 1, Math.max(0, targetRef.current + delta));
      targetRef.current = to;
      glidingRef.current = true;
      setTarget(to);
      track.scrollTo({ left: to * step });

      /*
       * Keep the keyboard somewhere real.
       *
       * Reaching either end disables the button that got you there, and a
       * disabled button leaves the tab order — so focus falls back to <body>
       * and the next Tab restarts from the top of the page. The other button
       * should take it.
       *
       * Noted here and done after the render, not called here. The button being
       * handed to is very often the one that is disabled at this instant — go
       * from the first card to the last in four quick clicks and the back arrow
       * is still disabled from being at the start — and `.focus()` on a
       * disabled button does nothing at all, silently. By the time the layout
       * effect below runs, the arrows have been re-rendered against the new
       * destination and the handover lands.
       */
      const active = document.activeElement;
      if (to === 0 && active === previousRef.current) handoverRef.current = "next";
      else if (to === count - 1 && active === nextRef.current) handoverRef.current = "previous";
    },
    [count]
  );

  /** @see the note in `move` — this is the second half of that handover. */
  useLayoutEffect(() => {
    const wanted = handoverRef.current;
    if (!wanted) return;
    handoverRef.current = null;
    (wanted === "next" ? nextRef : previousRef).current?.focus();
  }, [target]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    /*
     * Taking the arrows is free: this page has nothing to scroll sideways, so
     * they would otherwise do nothing at all. The handler sits on the wrapper
     * rather than the track so it catches them whether focus is on a card or on
     * one of the buttons below it.
     *
     * Home and End are deliberately left alone — they still jump the page,
     * which is what someone pressing them wants.
     */
    event.preventDefault();
    move(event.key === "ArrowRight" ? 1 : -1);
  };

  return (
    <div onKeyDown={onKeyDown}>
      {/*
        `-mx-4` cancels the track's own inline padding, so the card lines up
        with the heading above it while the scrollport keeps 16px of bleed for
        the card's hover growth. The two numbers have to stay in step; both are
        explained in app/globals.css.

        `role="list"` because Safari drops list semantics from a list whose
        markers are gone, and Tailwind's reset removes them. The count — "4
        items" — is the part worth keeping.
      */}
      <ul
        ref={trackRef}
        role="list"
        aria-label={listLabel}
        className="event-carousel-track -mx-4 mt-6"
      >
        {children}
      </ul>

      {count > 1 && (
        <div className="mt-1 flex items-center justify-center gap-4">
          {/* Arrows at every width — see the note on ARROW for why they are no
              longer withheld from a phone. */}
          <button
            type="button"
            ref={previousRef}
            onClick={() => move(-1)}
            disabled={target === 0}
            aria-label={previousLabel}
            data-tooltip={previousLabel}
            className={ARROW}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          {/* Position, drawn. The live region below says it in words, so these
              are decoration to anything that is not looking at the screen. */}
          <span aria-hidden="true" className="flex items-center gap-2">
            {Array.from({ length: count }, (_, slide) => (
              <span key={slide} className={slide === index ? DOT_CURRENT : DOT} />
            ))}
          </span>

          <button
            type="button"
            ref={nextRef}
            onClick={() => move(1)}
            disabled={target === count - 1}
            aria-label={nextLabel}
            data-tooltip={nextLabel}
            className={ARROW}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/*
        Sliding a card changes what the page says without moving focus, which is
        a change a screen reader has no reason to notice. `polite` waits for a
        gap in speech rather than interrupting. It says nothing on first render
        — a live region announces changes, not its opening contents — so this
        stays quiet until somebody actually moves.
      */}
      <p aria-live="polite" className="sr-only">
        {positionLabel
          .replace("{n}", String(index + 1))
          .replace("{total}", String(count))}
      </p>
    </div>
  );
}

/**
 * The distance from one snap stop to the next.
 *
 * Measured between two slides rather than taken from one slide's width, because
 * the track puts a gap between them — see app/globals.css for what that gap is
 * keeping off the screen. Subtracting two `offsetLeft` values gives width plus
 * gap and cancels out whatever either is offset from, so this needs no
 * assumption about which ancestor is positioned.
 *
 * A single slide has no next one to measure against, and also nowhere to go.
 */
function stepOf(track: HTMLElement): number {
  const first = track.children[0] as HTMLElement | undefined;
  const second = track.children[1] as HTMLElement | undefined;
  if (!first) return 0;
  return second
    ? second.offsetLeft - first.offsetLeft
    : first.getBoundingClientRect().width;
}

/**
 * Quiet on purpose. The photograph and the date are what this section is for,
 * and a pair of filled buttons under the card would compete with both. An
 * outline that fills in on hover is enough to read as pressable.
 *
 * `enabled:hover:` rather than `hover:`, so the arrow at the end of the line
 * does not light up under a pointer it will not answer.
 */
/*
 * Shown at every width, including a phone.
 *
 * These used to be `hidden sm:inline-flex`, on the reasoning that a finger
 * swipes and does not need a button. The swipe is still there and still the
 * nicer gesture, but it was the *only* one below 640px — and a swipe is
 * invisible: nothing on a still page says the card moves. Somebody who does not
 * think to try it has no way through the list at all, short of tabbing into the
 * track and using the keyboard arrows.
 *
 * 44px rather than 40, because on a phone these are now a primary control and
 * that is the smallest target WCAG 2.5.5 calls comfortable. It costs nothing on
 * a desktop, where the ring is the same size the eye already reads it as.
 */
const ARROW =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-sage/30 " +
  "text-charcoal-light transition-colors " +
  "enabled:hover:border-sage/50 enabled:hover:bg-sage/10 enabled:hover:text-charcoal " +
  "enabled:active:bg-sage/15 " +
  "disabled:border-sage/15 disabled:text-charcoal-light/40";

const DOT =
  "h-1.5 w-1.5 rounded-full bg-sage/40 " +
  "motion-safe:transition-[width,background-color] motion-safe:duration-200";

const DOT_CURRENT =
  "h-1.5 w-5 rounded-full bg-rose-deep " +
  "motion-safe:transition-[width,background-color] motion-safe:duration-200";
