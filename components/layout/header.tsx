"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Menu, X } from "lucide-react";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { SITE_NAME } from "@/lib/site-config";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/", key: "home" },
  { href: "/about", key: "about" },
  { href: "/blog", key: "blog" },
  { href: "/events", key: "events" },
  { href: "/testimonials", key: "testimonials" },
  { href: "/contact", key: "contact" },
] as const;

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
const NAV_LINK_BASE = "rounded-full px-4 py-2 text-sm transition-colors";
const NAV_LINK_REST =
  "text-charcoal-light hover:bg-sage/35 hover:text-charcoal active:bg-sage/45";
const NAV_LINK_CURRENT =
  "bg-rose/35 font-medium text-rose-deeper hover:bg-rose/45";

export function Header() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /* The observer below is created once and has to know the current state
     without being torn down and rebuilt every time that state changes. */
  const openRef = useRef(false);
  /* Whether the close now under way was caused by following a link, which
     changes where focus should end up. */
  const navigatingRef = useRef(false);

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

    const observer = new IntersectionObserver(
      (entries) => {
        /* A programmatic scroll can deliver several positions in one batch;
           only the last one is where the panel ended up. */
        const ratio = entries[entries.length - 1].intersectionRatio;

        if (ratio > ARRIVED) {
          setPageInert(true);
          /* Only if focus is not already inside — this fires again every time
             a half-swipe springs back, and stealing focus off a link the
             visitor had just tabbed to would be its own bug. */
          if (!sheet.contains(document.activeElement)) {
            sheet.focus({ preventScroll: true });
          }
        } else if (ratio < GONE && openRef.current) {
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

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <nav className="flex items-center justify-between rounded-2xl border border-white/30 bg-white/60 px-6 py-3 shadow-lg shadow-black/5 backdrop-blur-xl">
            {/* The wordmark answers to the pointer with a rule under it rather
                than a pill, because it is a piece of typography and not a
                control — and a transparent underline that only gains a colour
                means nothing moves when it appears. */}
            <Link
              href="/"
              className="font-serif text-xl font-semibold text-sage-dark underline decoration-transparent decoration-2 underline-offset-[6px] transition-colors hover:decoration-sage"
            >
              {SITE_NAME}
            </Link>

            <div className="hidden items-center gap-1 md:flex">
              {navLinks.map(({ href, key }) => {
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
              className="rounded-full p-2 text-charcoal-light transition-colors hover:bg-sage/35 hover:text-charcoal active:bg-sage/45 md:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </header>

      {/*
        A sibling of <header>, not a child of it: see setPageInert above. It
        keeps its `md:hidden` so that growing the window past the breakpoint
        while the drawer is open takes the panel off screen, which the observer
        reads as a close and cleans up after.
      */}
      <div
        ref={drawerRef}
        id="mobile-menu"
        hidden={!open}
        className="nav-drawer md:hidden"
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
              {navLinks.map(({ href, key }) => {
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
