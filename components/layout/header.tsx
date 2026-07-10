"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/", key: "home" },
  { href: "/blog", key: "blog" },
  { href: "/events", key: "events" },
  { href: "/testimonials", key: "testimonials" },
  { href: "/contact", key: "contact" },
] as const;

export function Header() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const locale = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <nav className="flex items-center justify-between rounded-2xl border border-white/30 bg-white/60 px-6 py-3 shadow-lg shadow-black/5 backdrop-blur-xl">
          <Link
            href="/"
            className="font-serif text-xl font-semibold text-sage-dark"
          >
            Yoga Flow
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map(({ href, key }) => {
              const isActive = href === "/"
                ? pathname === `/${locale}` || pathname === `/${locale}/`
                : pathname.startsWith(`/${locale}${href}`);
              return (
                <Link
                  key={key}
                  href={href}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-rose/10 text-rose font-medium"
                      : "text-charcoal-light hover:bg-white/40 hover:text-charcoal"
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

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-full p-2 text-charcoal-light hover:bg-white/40 md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </div>

      {mobileOpen && (
        <div className="mx-4 animate-fade-down rounded-2xl border border-white/30 bg-white/80 p-4 shadow-xl backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map(({ href, key }) => (
              <Link
                key={key}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-4 py-3 text-sm text-charcoal-light transition-colors hover:bg-white/40 hover:text-charcoal"
              >
                {t(key)}
              </Link>
            ))}
            <div className="mt-2 pt-2 border-t border-sage/20">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
