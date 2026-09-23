"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Menu, X } from "lucide-react";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { NAV_LINKS } from "@/lib/nav-links";
import { cn } from "@/lib/utils";


/**
 * Which link is the page you are on.
 *
 * `usePathname` here is next-intl's, not Next's, and it answers with the
 * pathname *minus* the locale — "/about", never "/ro/about". This used to
 * compare against `/${locale}${href}`, so it was asking whether "/about"
 * starts with "/ro/about" and the answer was always no: nothing in the
 * navigation has ever been marked as current, on either language.
 *
 * The second half is `=== href || startsWith(href + "/")` rather than a bare
 * `startsWith(href)` so that a future /blogging would not light up /blog.
 */
function isCurrent(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/*
 * Hover and focus across the whole bar, in one place.
 *
 * Sage means "you can go here", rose means "you are here". Keeping the two
 * jobs on two hues is what lets the current page stay marked while you hover
 * something else, and both are drawn from the palette that already exists in
 * globals.css rather than invented for the header.
 *
 * The alpha values are the point. The bar is white at 60% over cream, so it
 * renders around #FFFCF9, and the `bg-white/40` that used to be the hover
 * state resolves to about #FFFDFB — a contrast of 1.01:1 with the bar it sits
 * on, which is to say invisible. That is the same mistake the alternating
 * background bands made, and it is why hovering the navigation felt like
 * nothing was happening. Sage at 35% lands on #DCE1D1, 1.31:1, which reads as
 * a real change without shouting.
 *
 * The text stays dark rather than turning sage, because a wash strong enough
 * to see drags sage-deep text down to 3.9:1. Charcoal on the same wash is
 * 10.3:1, and darkening from charcoal-light to charcoal is a second cue that
 * costs nothing.
 *
 * Rose at 35% is #F7DCE1 — visible against the bar on the same measure — and
 * carries rose-deeper rather than rose-deep, because rose-deep on that wash is
 * 4.09:1 and misses AA for text this size. rose-deeper is 5.67:1.
 *
 * Tailwind v4 compiles `hover:` inside `@media (hover: hover)`, so none of
 * this sticks to a finger on a phone; `active:` is what a touch gets.
 */
/*
 * THE BAR COMPACTS ONCE THE PAGE MOVES, THEN GETS OUT OF THE WAY
 *
 * Two behaviours on one element, and they answer different complaints.
 *
 * COMPACTING answers "it takes vertical space and it hovers over my content".
 * Past the first 80px the bar stops pretending to float: it closes the gap
 * above itself, goes flush and edge to edge, turns opaque, drops the shadow,
 * and loses about 11px of height.
 *
 * AUTO-HIDING answers "it is always there". Once compacted, scrolling down
 * takes it off the top of the screen entirely and scrolling up brings it back.
 *
 * HOW TALL, AND WHY NOT SHORTER
 *
 * An earlier pass squeezed this to 43px by shrinking the links and the
 * language switcher to `py-1`, and read as too thin — a strip rather than a
 * navigation bar. This one holds the row at `py-2` and the links at `py-1.5`,
 * which lands at 51px on a desktop and 53px on a phone against a 62px default.
 * The switcher keeps its own padding and is what sets the desktop figure; the
 * hamburger's 44px tap target sets the phone one and is deliberately never
 * shrunk.
 *
 * WHAT "SLICING" ACTUALLY IS, MEASURED — AND WHY THE BLUR IS NOT THE CULPRIT
 *
 * The 12px gap is. The bar is fixed at the top with `py-3` around it, leaving a
 * 12px band of live, unblurred page between the viewport edge and the bar.
 * Content scrolls through that band and is guillotined by the bar's top edge —
 * on the home page at 900px it is the top half of "Următorul eveniment",
 * severed and floating above the bar with its lower half nowhere.
 *
 * The blur was the other suspect and it is innocent. A 24px backdrop blur does
 * not show letterforms, it shows a soft wash of whatever colour is underneath,
 * which is the whole point of the material and what makes it read as glass
 * rather than as a panel. What made it look guilty was that it sat next to the
 * gap: a severed heading directly above a smear reads as one fault.
 *
 * So compacting closes the gap and the glass stays. `backdrop-saturate-150`
 * joins it because the blur alone drains colour out of whatever passes beneath
 * and the result goes grey; pulling the saturation back up is what the platform
 * does and is the difference between glass and frosted plastic.
 *
 * THE THRESHOLDS ARE TWO NUMBERS, NOT ONE
 *
 * Compacting happens at 8px and hiding only past 80px. They were the same
 * number in the first pass and that left a 74px window — roughly 6px to 80px of
 * scroll — in which content had already slid under the bar while the bar was
 * still the floating card with the gap above it. Measured at scrollY 45: the
 * hero image visibly passing under a surface at 0.6 alpha with 12px of raw page
 * showing above it. Closing the gap has to happen the moment anything gets near
 * it; leaving is a separate question and can afford to wait.
 *
 * WHY THE CONTENT DOES NOT MOVE SIDEWAYS
 *
 * Uncompacted, the gutter is `px-4` on the shell plus `px-6` on the surface: 40px
 * in total. Compacted, the shell has no padding at all, so the row carries the
 * whole 40px itself as `px-10`.
 *
 * Measured: the wordmark does not move at all on a phone, and moves 1px on a
 * desktop width. The 1px is the border. Once the surface is full-bleed its
 * border sits *inside* the box the row centres itself in, so `max-w-7xl`
 * centres against 1438px rather than 1440 and each side absorbs half a pixel.
 * A phone never sees it because `max-w-7xl` does not bind there and no
 * centring happens.
 *
 * It could be made exact with a `calc(50% - 50vw)` full-bleed breakout that
 * leaves the row's padding alone entirely — but `vw` counts the scrollbar,
 * so on a desktop with one the bar would run wider than the viewport and put
 * a horizontal scrollbar on the whole document. One invisible pixel is the
 * better trade. For comparison, option 4 moved this 17px.
 *
 * The three borders the compact state does not want are RECOLOURED, not removed.
 * `border-x-0 border-t-0` was the obvious way to write it and it moved the
 * wordmark 1px left and made the bar 1px shorter, because a border is part of
 * the box: taking it away takes its width with it. Painting it the same colour
 * as the fill leaves the geometry untouched and the edge invisible, which is
 * the whole point — the bar is supposed to change how it looks, not where its
 * contents are.
 *
 * HOW MUCH BODY THE GLASS NEEDS, MEASURED
 *
 * The compact fill is `white/80`, and the number is not a taste decision. This
 * bar crosses the event-card photographs on the home page, and at `white/70` the
 * darkest of them left the surface dark enough to drop charcoal-light nav links
 * to 4.19:1 and the rose current-page pill to 3.46:1 — both under AA's 4.5:1. At
 * `white/80` the same worst case measures 5.52:1 and 4.55:1. Thinner glass looks
 * better in a screenshot of the top of the page and becomes unreadable a
 * thousand pixels down it.
 */
const BAR_SHELL =
  "mx-auto max-w-7xl px-4 py-3 transition-[max-width,padding] duration-200 ease-out " +
  "group-data-[compact]:max-w-none group-data-[compact]:px-0 group-data-[compact]:py-0";

const BAR_SURFACE =
  "rounded-2xl border border-white/30 bg-white/60 shadow-lg shadow-black/5 backdrop-blur-xl backdrop-saturate-150 " +
  "transition-[border-radius,background-color,box-shadow,border-color] duration-200 ease-out " +
  "group-data-[compact]:rounded-none group-data-[compact]:border-x-white/40 " +
  "group-data-[compact]:border-t-white/40 group-data-[compact]:border-b-sage/25 " +
  "group-data-[compact]:bg-white/80 group-data-[compact]:shadow-none";

const BAR_ROW =
  "mx-auto flex max-w-7xl items-center justify-between px-6 py-3 transition-[padding] duration-200 ease-out " +
  "group-data-[compact]:px-10 group-data-[compact]:py-2";

const NAV_LINK_BASE =
  "rounded-full px-4 py-2 text-sm whitespace-nowrap transition-[color,background-color,padding] duration-200 " +
  "group-data-[compact]:py-1.5";
const NAV_LINK_REST =
  "text-charcoal-light hover:bg-sage/35 hover:text-charcoal active:bg-sage/45";
const NAV_LINK_CURRENT =
  "bg-rose/35 font-medium text-rose-deeper hover:bg-rose/45";

export function Header({ siteName }: { siteName: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /* Past the first stretch of the page: the bar is flush, opaque and shorter
     rather than a floating card. */
  const [compact, setCompact] = useState(false);
  /* Parked above the top of the screen because the page is moving down. */
  const [hidden, setHidden] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lastScrollRef = useRef(0);
  /* Whether the bar has already introduced itself on this page — see the
     announce branch in the scroll effect. */
  const announcedRef = useRef(false);
  /* True for the moment just after it has, during which a downward scroll is
     not allowed to take it away again. */
  const dwellRef = useRef(false);
  const dwellTimerRef = useRef<number | null>(null);
  /* The observer below is created once and has to know the current state
     without being torn down and rebuilt every time that state changes. */
  const openRef = useRef(false);
  /* Whether the close now under way was caused by following a link, which
     changes where focus should end up. */
  const navigatingRef = useRef(false);

  /**
   * Take the page back to its own top.
   *
   * `scroll-behavior: smooth` in CSS would be the tidier spelling, but it is set
   * on the element being scrolled, and here that is the document — turning it on
   * there would also smooth every anchor jump and every `scrollTo` anything else
   * on the site makes. Passing the behaviour per call keeps it to this control.
   *
   * The reduced-motion check is explicit rather than trusted to the engine.
   * Browsers do honour the preference for CSS `scroll-behavior`, but coverage
   * for the `behavior` option passed to `scrollTo` is uneven, and a visitor who
   * asked for less motion should not have to rely on which of the two spellings
   * happened to be used.
   */
  const backToTop = useCallback(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, []);

  /**
   * Everything on the page except the drawer, made unreachable.
   *
   * `inert` is what stops a keyboard or a screen reader wandering into the
   * content sitting behind the dim — it removes the subtree from the tab order
   * and from the accessibility tree in one attribute, which is also why no
   * focus-trap loop is needed here.
   *
   * The drawer is rendered as a sibling of <header> rather than inside it
   * precisely so this can be one rule with no list of regions to keep in step:
   * every direct child of <body> that is not the drawer.
   */
  const setPageInert = useCallback((on: boolean) => {
    for (const child of Array.from(document.body.children)) {
      if (child !== drawerRef.current) child.toggleAttribute("inert", on);
    }
  }, []);

  /**
   * Darken the page in proportion to how far the panel has travelled.
   *
   * The comment above `--nav-drawer-open` in globals.css explains why this is
   * a listener and not the four lines of scroll-driven CSS it ought to be.
   */
  const syncDim = useCallback(() => {
    const scroller = scrollerRef.current;
    const drawer = drawerRef.current;
    if (!scroller || !drawer) return;
    const travel = scroller.scrollWidth - scroller.clientWidth;
    drawer.style.setProperty(
      "--nav-drawer-open",
      travel > 0 ? String(scroller.scrollLeft / travel) : "0"
    );
  }, []);

  /**
   * The panel has left the screen: put the page back the way it was.
   *
   * Every route out of the drawer ends here — a swipe, a tap on the dim,
   * Escape, the close button, a link, or the window growing past `md` — so
   * there is one place that knows what "closed" costs.
   *
   * The dim is zeroed here rather than on the way in. Leaving `display: none`
   * does not fire a scroll event, so a drawer that was closed by the
   * breakpoint rather than by a swipe would otherwise still be carrying the
   * inline value it had when it vanished, and would reopen with one frame of
   * full charcoal over the whole page.
   */
  const finishClose = useCallback(() => {
    openRef.current = false;
    setPageInert(false);
    drawerRef.current?.style.setProperty("--nav-drawer-open", "0");
    setOpen(false);
    /* Focus came from the hamburger and goes back to it, otherwise it lands on
       <body> and the next Tab starts from the top of the page. Not after a
       link, though: that would drag focus backwards onto the menu button of
       the page the visitor has just left. */
    if (!navigatingRef.current) triggerRef.current?.focus();
    navigatingRef.current = false;
  }, [setPageInert]);

  /**
   * Start closing. Scrolling the panel off the edge *is* the close animation,
   * and the observer below turns its arrival into `finishClose`.
   */
  const close = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (scroller.scrollLeft === 0) {
      /* Already at the closed stop, which means no scroll, no scroll event and
         no observer callback is ever coming. Without this branch a close asked
         for in the moment between the drawer being shown and the opening
         scroll starting would leave it open forever — and an open drawer whose
         panel is off-screen and whose dim is clear is an invisible full-screen
         layer that swallows every click on the site until a reload. */
      finishClose();
      return;
    }
    scroller.scrollTo({ left: 0, behavior: "auto" });
  }, [finishClose]);

  /**
   * Closing because the visitor followed a link out of the menu.
   *
   * The page is taken out of `inert` now rather than when the panel finishes
   * sliding away, because `<next-route-announcer>` — the element Next uses to
   * read the new page out to a screen reader — is a direct child of <body> and
   * so is one of the things this marks inert. Announced while inert is not
   * announced at all.
   */
  const closeAfterNavigation = useCallback(() => {
    navigatingRef.current = true;
    setPageInert(false);
    close();
  }, [close, setPageInert]);

  /* Slide in. The drawer has just stopped being display:none, so it is sitting
     at scroll position 0 — closed — and one scroll to the far end is the whole
     animation. `behavior: "auto"` defers to the CSS, which is smooth unless the
     visitor asked for less motion. */
  useEffect(() => {
    openRef.current = open;
    if (!open) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ left: scroller.scrollWidth, behavior: "auto" });
  }, [open]);

  /* Scroll events fire throughout a smooth programmatic scroll as well as a
     drag, so this covers opening, closing and the finger equally. */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.addEventListener("scroll", syncDim, { passive: true });
    return () => scroller.removeEventListener("scroll", syncDim);
  }, [syncDim]);

  /**
   * Where the drawer's state actually comes from.
   *
   * Not the scroll position, which would mean deciding how near either end
   * counts as arrived, but whether the panel is on screen — so a flick, a slow
   * drag, a tap on the dim and the breakpoint growing past `md` all arrive in
   * the same callback and leave the same state behind.
   */
  useEffect(() => {
    const drawer = drawerRef.current;
    const sheet = sheetRef.current;
    if (!drawer || !sheet) return;

    /*
     * A hundredth of the panel at either end, not none of it and all of it.
     *
     * `1` is the tempting number for ARRIVED and it is a trap. An
     * IntersectionObserver only calls back when the ratio crosses into a
     * different band of its threshold list, so if a snap stop settles a
     * hundredth of a pixel short the ratio lands at 0.9999, stays in the same
     * band it was already in, and no callback is delivered at all — leaving
     * the page behind the drawer never marked inert and focus never moved,
     * silently, with the drawer looking perfectly correct. Both engines do
     * reach exactly 1 when measured, which is precisely why this should not
     * depend on it.
     *
     * Three pixels of a 300-pixel panel is below noticing at either end.
     */
    const GONE = 0.01;
    const ARRIVED = 0.99;

    /*
     * Only a falling ratio means the panel has left.
     *
     * The opening scroll's first frame can move the panel by a few pixels, and
     * the observer reports that sliver — isIntersecting has just turned true —
     * with a ratio under GONE. Without its direction, that reading is the same
     * as the panel leaving, and the drawer shuts as it opens.
     * tests/public-home.spec.ts replays that reading.
     */
    let lastRatio = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        /* A programmatic scroll can deliver several positions in one batch;
           only the last one is where the panel ended up. */
        const ratio = entries[entries.length - 1].intersectionRatio;
        const falling = ratio < lastRatio;
        lastRatio = ratio;

        if (ratio > ARRIVED) {
          setPageInert(true);
          /* Only if focus is not already inside — this fires again every time
             a half-swipe springs back, and stealing focus off a link the
             visitor had just tabbed to would be its own bug. */
          if (!sheet.contains(document.activeElement)) {
            sheet.focus({ preventScroll: true });
          }
        } else if (ratio < GONE && falling && openRef.current) {
          finishClose();
        }
      },
      { root: drawer, threshold: [GONE, ARRIVED] }
    );
    observer.observe(sheet);

    return () => {
      observer.disconnect();
      /* A locale switch remounts this subtree. Leaving without clearing inert
         would leave the whole page unreachable with no drawer to explain it. */
      setPageInert(false);
    };
  }, [setPageInert, finishClose]);

  /* Escape, listened for on the document because focus is inside the drawer. */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  /**
   * Where the page is and which way it just went — the whole behaviour, in one
   * listener.
   *
   * ONE MECHANISM, NOT TWO
   *
   * An earlier pass used an IntersectionObserver on a sentinel for "how far
   * down" and a scroll listener for "which way", because an observer is the
   * cheaper way to ask the first question. But the listener has to exist
   * regardless — no CSS and no observer reports scroll *direction* — and once
   * it is running, the position it already has in hand answers the first
   * question for nothing. Two sources of truth for one bar is how the two
   * halves drift out of step.
   *
   * Passive, and measured inside a `requestAnimationFrame`, so a scroll never
   * waits on this and it runs once per painted frame rather than once per
   * event. iOS dispatches scroll far faster than it paints.
   */
  useEffect(() => {
    /* Close the gap as soon as anything is near it. Content starts sliding
       under the bar about six pixels into the scroll, so this has to be small;
       8px is past the jitter of a settling flick and below noticing. */
    const COMPACT_AT = 8;
    /* The stretch at the top where the bar is part of the design rather than in
       the way, and so must not leave. Deliberately the 80px the layout already
       reserves for it, so the bar can only start hiding once the content it was
       making room for has reached the top of the screen. */
    const ALWAYS_SHOWN = 80;
    /* Travel in one direction before the bar reacts. A flick leaves a pixel or
       two of jitter as it settles, and without this each of those reads as a
       direction change and flickers the bar. */
    const DEADZONE = 8;
    /* How long the bar stays put after introducing itself. Long enough to be
       seen and read, short enough not to feel stuck. */
    const ANNOUNCE_MS = 1600;

    let queued = false;

    const read = () => {
      queued = false;

      /* Clamped at both ends because iOS reports positions past them while
         rubber-banding, and a bounce at the foot of a page is a down-then-up
         that would otherwise pull the bar back in by itself. */
      const limit = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      const y = Math.min(Math.max(window.scrollY, 0), limit);
      const delta = y - lastScrollRef.current;

      setCompact(y > COMPACT_AT);

      if (y <= ALWAYS_SHOWN) {
        lastScrollRef.current = y;
        setHidden(false);
        return;
      }

      /*
       * THE FIRST CROSSING INTRODUCES THE BAR
       *
       * Someone arriving from an Instagram link can land halfway down an event
       * page, or scroll straight past the header without ever scrolling back
       * up. Plain auto-hide would mean they never see the navigation at all:
       * the only gesture that reveals it is one they have no reason to make,
       * because they do not know there is anything to reveal.
       *
       * So the first time the page is past the threshold — whether it got
       * there by scrolling or was already there when the script started — the
       * bar shows itself and holds for a moment before the normal rules
       * resume. It is the difference between a control that is discoverable
       * and one that is merely present.
       */
      if (!announcedRef.current) {
        announcedRef.current = true;
        lastScrollRef.current = y;
        setHidden(false);
        dwellRef.current = true;
        dwellTimerRef.current = window.setTimeout(() => {
          dwellRef.current = false;
        }, ANNOUNCE_MS);
        return;
      }

      /* The reference point is deliberately not updated until the deadzone is
         cleared, so slow travel accumulates towards it instead of being thrown
         away a pixel at a time and never arriving. */
      if (Math.abs(delta) < DEADZONE) return;
      lastScrollRef.current = y;

      /* Scrolling up always wins, even mid-announcement — asking for the bar
         should never be refused. Only the hide waits for the dwell. */
      if (dwellRef.current && delta > 0) return;
      setHidden(delta > 0);
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(read);
    };

    lastScrollRef.current = Math.max(0, window.scrollY);
    /* Read once on mount as well as on scroll: a page opened at an anchor, or
       restored by the back button, can already be past the threshold and may
       never fire a scroll event at all. Without this the announcement would be
       skipped for exactly the visitor it was written for. */
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (dwellTimerRef.current !== null) {
        window.clearTimeout(dwellTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      {/* Two independent pieces of state on one element. `data-compact` drives
          the shape through the `group-data-` variants above; `data-hidden`
          drives the translate in globals.css. They are separate because a bar
          can be compact and on screen, compact and away, or neither — but
          never hidden while it is still the floating card, since nothing hides
          inside the first 80px. */}
      <header
        data-compact={compact ? "" : undefined}
        data-hidden={hidden ? "" : undefined}
        className="nav-bar group fixed top-0 left-0 right-0 z-50"
      >
        <div className={BAR_SHELL}>
          {/* Named, because there are two navigation landmarks on a page now —
              this one and the footer's index. Unnamed, a screen reader offers
              "navigation" twice with nothing to choose between them. The name
              omits the word: <nav> already announces itself as navigation. */}
          <nav aria-label={t("landmark.primary")} className={BAR_SURFACE}>
            <div className={BAR_ROW}>
            {/*
              The wordmark answers to the pointer with a rule under it rather
              than a pill, because it is a piece of typography and not a control
              — and a transparent underline that only gains a colour means
              nothing moves when it appears.

              IT SCROLLS TO THE TOP; IT DOES NOT GO HOME

              A wordmark linking to "/" is close to universal, and it was that
              until now. It was also redundant here: "Acasă" sits four pixels to
              the right of it and does exactly that job, so the most prominent
              thing in the bar was the second control for a destination already
              covered. Taking the page back to its own top is the job nothing
              else in the bar does — and it is worth more now that the bar spends
              most of its time off-screen.

              The cost, stated plainly: a deep page no longer has a one-click
              route home from the wordmark. The nav link and the drawer both
              still carry it.

              A <button>, not a link with its default prevented. A link whose
              href says "/" and whose click does something else lies to the
              status bar, to middle-click and to anyone reading the markup.

              The accessible name is the brand plus the action, so the visible
              word is contained in it — what WCAG 2.5.3 asks — while a screen
              reader still hears what pressing it does rather than just a name.
            */}
            <button
              type="button"
              onClick={backToTop}
              data-tooltip={t("back_to_top")}
              aria-label={`${siteName} — ${t("back_to_top")}`}
              className="min-w-0 rounded-sm font-serif text-xl font-semibold text-sage-dark underline decoration-transparent decoration-2 underline-offset-[6px] transition-[color,text-decoration-color,font-size] duration-200 ease-out hover:decoration-sage group-data-[compact]:text-lg"
            >
              {/*
                The truncation is on this span rather than on the button, and
                that is not cosmetic. `truncate` is `overflow: hidden`, and an
                element with hidden overflow clips its own `::after` — which is
                where the tooltip lives. With it on the button the tooltip
                computed as fully opaque and painted nothing at all, which is a
                failure no computed-style check catches. The button is still the
                thing that shrinks (`min-w-0`); this just does the cutting.
              */}
              <span className="block truncate">{siteName}</span>
            </button>

            {/*
              `lg`, not `md`. The Romanian labels need 840px to sit on one line —
              measured, walking the viewport down in 10px steps until the bar
              grew a second row — and `md` is 768px, so between 768 and 840 the
              links wrapped and the bar grew to two lines rather than handing
              over to the hamburger. English fits in 770px, which is why this
              only ever showed up in the primary language.

              `lg` is 1024px: 184px of headroom rather than a number tuned to
              today's longest label. That margin is the point, because the brand
              name beside these links is now hers to change and a longer one eats
              into exactly this space.
            */}
            <div className="hidden items-center gap-1 lg:flex">
              {NAV_LINKS.map(({ href, key }) => {
                const current = isCurrent(href, pathname);
                return (
                  <Link
                    key={key}
                    href={href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      NAV_LINK_BASE,
                      current ? NAV_LINK_CURRENT : NAV_LINK_REST
                    )}
                  >
                    {t(key)}
                  </Link>
                );
              })}
              <div className="ml-2">
                <LanguageSwitcher />
              </div>
            </div>

            {/* Still a toggle, even though the drawer covers it and marks it
                inert the moment it is open, so the button is unreachable in
                that state. It stays one because `aria-expanded` says the menu
                is open, and a control that announces itself as expanded while
                being named "open the menu" contradicts itself — which is what
                a screen reader would meet if the inert ever failed to apply. */}
            <button
              ref={triggerRef}
              onClick={() => (open ? close() : setOpen(true))}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? t("menu.close") : t("menu.open")}
              className="rounded-full p-2 text-charcoal-light transition-colors hover:bg-sage/35 hover:text-charcoal active:bg-sage/45 lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            </div>
          </nav>
        </div>
      </header>

      {/*
        A sibling of <header>, not a child of it: see setPageInert above. It
        keeps a `lg:hidden` matching the link row, so that growing the window past
        the breakpoint while the drawer is open takes the panel off screen, which
        the observer reads as a close and cleans up after.
      */}
      <div
        ref={drawerRef}
        id="mobile-menu"
        hidden={!open}
        className="nav-drawer lg:hidden"
        onClick={(event) => {
          /* Anywhere inside the drawer that is not the panel is the dimmed
             page, and tapping the page you can see is the most obvious way
             out of a menu. */
          if (!sheetRef.current?.contains(event.target as Node)) close();
        }}
      >
        <div className="nav-drawer-dim" />

        <div ref={scrollerRef} className="nav-drawer-scroller">
          <nav
            ref={sheetRef}
            tabIndex={-1}
            aria-label={t("menu.label")}
            className="nav-drawer-sheet flex flex-col bg-warm-white focus:outline-none"
          >
            <div className="flex justify-end">
              <button
                onClick={close}
                aria-label={t("menu.close")}
                className="rounded-full p-2 text-charcoal-light transition-colors hover:bg-sage/35 hover:text-charcoal active:bg-sage/45"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Playfair, at a size worth reading, because a drawer is the one
                place the navigation is the content rather than a strip above
                it. */}
            <div className="mt-4 flex flex-col gap-1">
              {NAV_LINKS.map(({ href, key }) => {
                const current = isCurrent(href, pathname);
                return (
                  <Link
                    key={key}
                    href={href}
                    onClick={closeAfterNavigation}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "rounded-xl px-4 py-3 font-serif text-lg transition-colors",
                      /* A quarter rather than the bar's third: the same wash
                         over a row six times the area of a pill reads as a
                         highlighter stroke through the panel. */
                      current
                        ? "bg-rose/25 text-rose-deeper"
                        : "text-charcoal hover:bg-sage/35 active:bg-sage/45"
                    )}
                  >
                    {t(key)}
                  </Link>
                );
              })}
            </div>

            <div className="mt-auto border-t border-sage/20 pt-4">
              <LanguageSwitcher />
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
