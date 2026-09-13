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

  /*
   * The same sage hover the navigation links use, for the same reason: the old
   * `bg-white/40` → `bg-white/60` step is a 1.01:1 change against a bar that is
   * already nearly white, so the control looked inert.
   *
   * `backdrop-blur-sm` went with it. The header above already blurs, and
   * blurring a second time inside it buys nothing except another compositing
   * layer — which is what costs the text its subpixel antialiasing. Inside the
   * drawer, where this also renders, it was blurring an opaque panel.
   *
   * The border is what makes it look like something you can press. Its fill is
   * white on a surface that is already almost white, in the bar and in the
   * drawer both, so without an edge the flag and the two letters simply float
   * there as text.
   */
  return (
    <button
      onClick={toggleLocale}
      disabled={isPending}
      aria-label={action}
      title={action}
      className="flex items-center gap-1.5 rounded-full border border-sage/30 bg-white/50 px-3 py-1.5 text-sm text-charcoal-light transition-colors hover:bg-sage/35 hover:text-charcoal active:bg-sage/45"
    >
      <Flag code={FLAG[locale] ?? "RO"} />
      <span aria-hidden="true">{locale.toUpperCase()}</span>
    </button>
  );
}
