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
   * The button shows BOTH languages, with the one you are reading first.
   *
   * It has been through three shapes. It showed the language you would switch
   * *to* ("EN" while reading Romanian), which is a coin-flip for the reader:
   * both readings are plausible and the only way to find out was to press it.
   * Then it showed the language you were reading ("RO" while reading Romanian),
   * which is unambiguous but silent about the alternative — a visitor who does
   * not read Romanian had no way to know English existed without hovering for a
   * tooltip, and hovering to discover something is not a thing most people do.
   *
   * "RO|EN" says both facts at once: which one you are in, and that there is
   * another. The flag and the leading code always agree and always describe the
   * page you are on; the trailing code is the offer.
   *
   * The pair swaps on toggle rather than holding position, so "flag plus the
   * code beside it" is a single unit that always means *current*. The trade is
   * that the alternative moves from one side to the other — acceptable with two
   * languages, and the reason this is not built as a segmented control, where
   * segments must hold still and each is separately clickable.
   *
   * One consequence worth knowing: this is a toggle, so pressing the code you
   * are already in also switches. The active code is weighted to read as
   * already-selected rather than as an option, which is what keeps that from
   * being an invitation.
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
      data-tooltip={action}
      className="flex items-center gap-1.5 rounded-full border border-sage/30 bg-white/50 px-3 py-1.5 text-sm text-charcoal-light transition-colors hover:bg-sage/35 hover:text-charcoal active:bg-sage/45"
    >
      <Flag code={FLAG[locale] ?? "RO"} />
      {/*
        Hidden from assistive technology, all of it. The accessible name is the
        `aria-label` above — "Switch to English" — which says what pressing this
        does; "RO|EN" read aloud says nothing useful and would compete with it.

        Both codes are full-strength colours rather than one being faded: on the
        compacted bar this sits over photographs, where charcoal-light already
        measures 5.52:1 against the worst backdrop on the site and anything
        lighter drops under AA. The weight carries the distinction instead,
        which costs no contrast at all.
      */}
      <span aria-hidden="true" className="flex items-center gap-1">
        <span className="font-medium text-charcoal">{locale.toUpperCase()}</span>
        <span className="text-charcoal-light">|</span>
        <span className="text-charcoal-light">{next.toUpperCase()}</span>
      </span>
    </button>
  );
}
