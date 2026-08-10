"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransition } from "react";
import { Flag } from "@/components/ui/flag";

/**
 * Which flag stands for each language.
 *
 * English gets GB rather than US because the rest of the site is written in
 * British English and the audience is European. Neither is "correct" — a
 * language is not a country — which is why the flag is decorative here and the
 * text beside it is what actually carries the meaning.
 */
const FLAG: Record<string, string> = { ro: "RO", en: "GB" };

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const next = locale === "ro" ? "en" : "ro";

  const toggleLocale = () => {
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  };

  /*
   * The button shows the language you are reading, not the one you would switch
   * to.
   *
   * It used to show the opposite — "EN" while the page was in Romanian — which
   * is a genuine coin-flip for the reader: both readings are plausible and the
   * only way to find out was to press it. Showing current state and describing
   * the action in the accessible name splits those two jobs properly, which is
   * also what makes the control readable to a screen reader: it announces
   * "Switch to English", not the bare letters.
   */
  const action = locale === "ro" ? "Switch to English" : "Treci la română";

  return (
    <button
      onClick={toggleLocale}
      disabled={isPending}
      aria-label={action}
      title={action}
      className="flex items-center gap-1.5 rounded-full bg-white/40 px-3 py-1.5 text-sm text-charcoal-light backdrop-blur-sm transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50"
    >
      <Flag code={FLAG[locale] ?? "RO"} />
      <span aria-hidden="true">{locale.toUpperCase()}</span>
    </button>
  );
}
