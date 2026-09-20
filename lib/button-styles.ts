import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * The button's visual classes, as a plain function.
 *
 * Deliberately in its own module with no `"use client"` directive, so both
 * sides of the app can use it. This file has cost two mistakes, both of which
 * only appeared when the page was actually loaded in a browser:
 *
 *  1. `<Button asChild><Link/></Button>` works by cloning its child, which
 *     needs `isValidElement()` to recognise it. Across a Server Component
 *     boundary the child arrives as a serialised reference, the clone branch is
 *     skipped, and the component falls through to rendering a real <button>
 *     wrapped around the link — the exact `<button><a></a></button>` that
 *     asChild exists to prevent. Silent, and correct-looking on screen.
 *
 *  2. Moving these classes into a function fixed that, but the function was
 *     exported from the `"use client"` button module. A Server Component may
 *     render a client component, but it may not *call* a function exported from
 *     one: "Attempted to call buttonClasses() from the server but buttonClasses
 *     is on the client." The page still returned HTTP 200 while the whole hero
 *     section quietly failed to render.
 *
 * Hence: styling here, behaviour in components/ui/button.tsx. Use these classes
 * directly on a link:
 *
 *     <Link href="/events" className={buttonClasses({ size: "lg" })}>…</Link>
 *
 * which produces one <a> that looks like a button — unambiguous for assistive
 * technology, and valid HTML.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    // `whitespace-nowrap` keeps a label and its trailing arrow on one line.
    "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-full font-medium",
    "transition-colors transition-transform duration-200",
    // No focus classes here on purpose. The rose-deep outline in globals.css
    // covers every button and link on the site, including this one, and it does
    // the job the `ring-offset-cream` used to: the offset shows the page through
    // the gap instead of the ring having to be told what colour the page is.
    "disabled:pointer-events-none disabled:opacity-50",
    {
      // White on rose-deep is 5.29:1. It was 2.08:1 on the old pastel — the
      // label on every call to action was effectively low-vision text.
      "bg-rose-deep text-white hover:bg-rose-deeper shadow-lg shadow-rose-deep/20":
        variant === "primary",
      "border border-sage/40 bg-white/70 text-charcoal hover:bg-white hover:border-sage-deep/40 backdrop-blur-sm":
        variant === "secondary",
      /*
       * THE HOVER USED TO BE `bg-white/40`, WHICH IS NOT A COLOUR ON THIS SITE.
       *
       * White at 40% over the cream page (#FFF8F0) resolves to (255, 251, 246)
       * against a resting (255, 248, 240): three points of green, six of blue,
       * none of red. That is below what an eye picks up, so the button declared
       * a hover state and produced no visible change — and inside a GlassCard,
       * which is already white at 60%, it was fainter still. A hover that does
       * nothing is a bug rather than a restrained choice.
       *
       * Sage at 10% lands on (245, 241, 230): ten points of red and blue, seven
       * of green. Still the quietest button on the site, and now actually there.
       * It is also the tint the carousel arrows and the calendar menu already
       * use, so "faint sage wash" means one thing everywhere.
       *
       * `active:` as well as `hover:`, because Tailwind wraps `hover:` in
       * `@media (hover: hover)` — on the phone this audience arrives with, the
       * hover rule does not exist at all and a tap produced no feedback of any
       * kind. `active:` is not gated that way.
       */
      "text-charcoal-light hover:text-charcoal hover:bg-sage/10 active:bg-sage/15":
        variant === "ghost",
    },
    {
      // Minimum 44px tall from `md` up: the tap-target size assistive guidance
      // asks for, and this audience is almost entirely on phones.
      "h-10 px-4 text-sm": size === "sm",
      "h-12 px-6 text-base": size === "md",
      "h-14 px-8 text-lg": size === "lg",
    },
    // `motion-safe:` is a CSS media query, so it respects the OS "reduce
    // motion" setting without any JavaScript.
    "motion-safe:hover:scale-[1.03] motion-safe:active:scale-[0.97]",
    className
  );
}
