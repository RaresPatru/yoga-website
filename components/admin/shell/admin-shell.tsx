"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Calendar,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  PenLine,
  Star,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminErrorKey, toAdminError } from "@/lib/admin/db";
import { NAV_COOKIE, NAV_COOKIE_MAX_AGE } from "@/lib/admin/nav-cookie";
import { adminLabel } from "@/lib/admin/site-label";
import { cn } from "@/lib/utils";
import { Flag } from "@/components/ui/flag";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useToast } from "@/components/admin/ui/toaster";
import { useAdminSite } from "./admin-site";
import { SidebarToggleIcon } from "./sidebar-toggle-icon";

/**
 * The admin panel's frame: the sidebar, the top bar, and the phone drawer.
 *
 * On a computer the sidebar sticks to the left edge and never scrolls away.
 * Its toggle pins it either wide (icons and labels) or narrow (icons only).
 * While it is pinned narrow, resting the pointer on it, or moving keyboard
 * focus into it, widens it over the page without moving the page; it narrows
 * again when the pointer leaves or focus moves on. Only the toggle changes
 * what it is pinned to, and a cookie remembers the choice so the next page
 * load starts at the right width (app/admin/(panel)/layout.tsx reads it).
 *
 * Below 1024px the sidebar is replaced by a menu button in the top bar that
 * opens the same links in a drawer. The drawer is a modal <dialog>, so the
 * browser keeps focus inside it, closes it on Escape, and makes the page behind
 * it unreachable until it closes.
 */

/**
 * Where each section lives, in the order she reaches for them: the events and
 * the people booked on them, then what people have written to her, then her
 * own writing, then the settings she changes least.
 */
const NAV_LINKS = [
  { href: "/admin", icon: LayoutDashboard, key: "dashboard" },
  { href: "/admin/events", icon: Calendar, key: "events" },
  { href: "/admin/registrations", icon: Users, key: "registrations" },
  { href: "/admin/messages", icon: MessageSquare, key: "messages" },
  { href: "/admin/testimonials", icon: Star, key: "testimonials" },
  { href: "/admin/blog", icon: FileText, key: "blog" },
  { href: "/admin/emails", icon: Mail, key: "emails" },
  { href: "/admin/content", icon: PenLine, key: "content" },
] as const;

/** The dashboard matches only itself; a section also matches the pages inside it, such as an editor. */
function isCurrent(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * How long the pointer must rest on the narrow sidebar before it widens, and
 * how long after it leaves before the sidebar narrows. The first stops a
 * pointer passing across the screen from flashing it open; the second forgives
 * a pointer that slips off the edge for a moment.
 */
const WIDEN_DELAY_MS = 120;
const NARROW_DELAY_MS = 250;

/**
 * One row of the navigation. The left padding centres the 20px icon in the
 * 4.5rem rail (0.75rem of nav padding + 0.875rem + 10px = 36px, half of
 * 72px), so the icons do not move when the rail widens or narrows.
 */
const LINK_CLASS =
  "flex h-11 w-full items-center gap-3 rounded-xl px-[0.875rem] text-sm transition-colors";

export function AdminShell({
  initialCollapsed,
  children,
}: {
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const { t, locale, setLocale } = useAdminLocale();
  const { siteName } = useAdminSite();
  const toast = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // Widened over the page while pinned narrow (hover or keyboard focus).
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number | undefined>(undefined);
  const drawerRef = useRef<HTMLDialogElement>(null);

  const schedulePeek = (open: boolean) => {
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(
      () => setPeek(open),
      open ? WIDEN_DELAY_MS : NARROW_DELAY_MS
    );
  };

  useEffect(() => () => window.clearTimeout(peekTimer.current), []);

  // Arriving on another page closes the phone drawer.
  useEffect(() => {
    drawerRef.current?.close();
  }, [pathname]);

  // Widening the window past the phone layout closes the drawer. Hiding it
  // with CSS instead would leave a modal dialog open and invisible, with the
  // whole page unreachable behind it.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const closeIfWide = () => {
      if (wide.matches) drawerRef.current?.close();
    };
    wide.addEventListener("change", closeIfWide);
    return () => wide.removeEventListener("change", closeIfWide);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    window.clearTimeout(peekTimer.current);
    setPeek(false);
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "expanded"}; path=/admin; max-age=${NAV_COOKIE_MAX_AGE}; samesite=lax`;
  };

  const signOut = async () => {
    const { error } = await createClient().auth.signOut();
    if (error) {
      toast.error(t(adminErrorKey(toAdminError(error))));
      return;
    }
    router.push("/admin/login");
  };

  const label = adminLabel(siteName);

  const navList = (
    <ul className="space-y-1">
      {NAV_LINKS.map(({ href, icon: Icon, key }) => {
        const current = isCurrent(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              onClick={() => setPeek(false)}
              className={cn(
                LINK_CLASS,
                current
                  ? "bg-rose/15 font-medium text-rose-deep"
                  : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="admin-nav-label">{t(`admin.${key}`)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const signOutButton = (
    <button
      type="button"
      onClick={signOut}
      className={cn(LINK_CLASS, "text-charcoal-light hover:bg-error/5 hover:text-error")}
    >
      <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="admin-nav-label">{t("admin.logout")}</span>
    </button>
  );

  // The visible text is the panel's current language, like the public
  // switcher; the accessible name says what pressing it does.
  const languageSwitch = (
    <button
      type="button"
      onClick={() => setLocale(locale === "ro" ? "en" : "ro")}
      aria-label={locale === "ro" ? "Switch to English" : "Treci la română"}
      className="flex h-10 items-center gap-2 rounded-full px-3 text-sm text-charcoal-light transition-colors hover:bg-sage/15 hover:text-charcoal"
    >
      <Flag code={locale === "ro" ? "RO" : "GB"} />
      <span>{locale === "ro" ? "Română" : "English"}</span>
    </button>
  );

  return (
    <>
      <div
        className="admin-shell"
        data-collapsed={collapsed ? "true" : "false"}
        data-peek={collapsed && peek ? "true" : "false"}
      >
        {/* The first stop for the Tab key, so the navigation can be skipped. */}
        <a href="#admin-main" className="admin-skip-link">
          {t("admin.skip_to_content")}
        </a>

        <aside className="admin-rail">
          <div
            className="admin-rail-panel"
            onPointerEnter={(event) => {
              if (collapsed && event.pointerType === "mouse") schedulePeek(true);
            }}
            onPointerLeave={(event) => {
              if (collapsed && event.pointerType === "mouse") schedulePeek(false);
            }}
            onFocus={() => {
              if (!collapsed) return;
              window.clearTimeout(peekTimer.current);
              setPeek(true);
            }}
            onBlur={(event) => {
              if (collapsed && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setPeek(false);
              }
            }}
          >
            <div className="flex h-(--admin-header-h) shrink-0 items-center px-3">
              {/*
                A toggle button with a name that stays put, "Narrow sidebar",
                and `aria-pressed` for which way it is set: a screen reader
                hears "Narrow sidebar, toggle button, pressed". The tooltip
                says what pressing it will do.
              */}
              <button
                type="button"
                onClick={toggle}
                aria-pressed={collapsed}
                aria-label={t("admin.nav.narrow")}
                data-tooltip={collapsed ? t("admin.nav.widen_hint") : t("admin.nav.narrow_hint")}
                className="flex h-11 w-12 items-center justify-center rounded-xl text-charcoal-light transition-colors hover:bg-sage/15 hover:text-charcoal"
              >
                <SidebarToggleIcon action={collapsed ? "widen" : "narrow"} className="h-5 w-5" />
              </button>
            </div>
            {/*
              The labels are clipped here, on the list and the sign-out row,
              rather than on the whole panel: while the rail is narrow they are
              still there, only transparent, and without the clip they would
              hang over the page and catch clicks meant for it. The toggle's
              row is left unclipped so its tooltip can reach over the page.
            */}
            <nav
              aria-label={t("admin.nav.label")}
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-2"
            >
              {navList}
            </nav>
            <div className="overflow-x-hidden border-t border-sage/20 px-3 py-3">{signOutButton}</div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex h-(--admin-header-h) items-center gap-2 border-b border-sage/20 bg-cream/85 px-4 backdrop-blur-md sm:px-6">
            <button
              type="button"
              onClick={() => drawerRef.current?.showModal()}
              aria-label={t("admin.open_menu")}
              aria-haspopup="dialog"
              aria-controls="admin-drawer"
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-charcoal-light hover:bg-sage/15 lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <Link href="/admin" className="min-w-0 truncate font-serif text-lg text-charcoal">
              {label}
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <a
                href={`/${locale}`}
                target="_blank"
                rel="noopener"
                className="hidden h-10 items-center gap-1.5 rounded-full px-3 text-sm text-charcoal-light transition-colors hover:bg-sage/15 hover:text-charcoal sm:flex"
              >
                {t("admin.view_site")}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t("admin.opens_new_tab")}</span>
              </a>
              <div className="hidden lg:block">{languageSwitch}</div>
            </div>
          </header>

          <main
            id="admin-main"
            tabIndex={-1}
            className="mx-auto w-full max-w-(--admin-main-max) px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8"
          >
            {children}
          </main>
        </div>
      </div>

      <dialog
        ref={drawerRef}
        id="admin-drawer"
        aria-label={t("admin.nav.menu")}
        className="admin-drawer"
        onClick={(event) => {
          // A click on the dimmed backdrop lands on the <dialog> itself.
          if (event.target === event.currentTarget) drawerRef.current?.close();
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-(--admin-header-h) shrink-0 items-center justify-between border-b border-sage/20 px-4">
            <span className="truncate font-serif text-lg text-charcoal">{label}</span>
            <button
              type="button"
              onClick={() => drawerRef.current?.close()}
              aria-label={t("admin.close_menu")}
              className="flex h-11 w-11 items-center justify-center rounded-full text-charcoal-light hover:bg-sage/15"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <nav aria-label={t("admin.nav.label")} className="flex-1 overflow-y-auto px-3 py-3">
            {navList}
          </nav>
          <div className="space-y-1 border-t border-sage/20 px-3 py-3">
            <a
              href={`/${locale}`}
              target="_blank"
              rel="noopener"
              className={cn(LINK_CLASS, "text-charcoal-light hover:bg-sage/15 hover:text-charcoal")}
            >
              <ExternalLink className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{t("admin.view_site")}</span>
              <span className="sr-only">{t("admin.opens_new_tab")}</span>
            </a>
            {languageSwitch}
            {signOutButton}
          </div>
        </div>
      </dialog>
    </>
  );
}
