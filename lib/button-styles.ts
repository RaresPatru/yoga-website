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
    // The focus ring uses the deep rose: a 50%-opacity pastel ring was nearly
    // invisible against cream, which defeats the purpose for keyboard users.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-deep focus-visible:ring-offset-2 focus-visible:ring-offset-cream",
    "disabled:pointer-events-none disabled:opacity-50",
    {
      // White on rose-deep is 5.29:1. It was 2.08:1 on the old pastel — the
      // label on every call to action was effectively low-vision text.
      "bg-rose-deep text-white hover:bg-rose-deeper shadow-lg shadow-rose-deep/20":
        variant === "primary",
      "border border-sage/40 bg-white/70 text-charcoal hover:bg-white hover:border-sage-deep/40 backdrop-blur-sm":
        variant === "secondary",
      "text-charcoal-light hover:text-charcoal hover:bg-white/40": variant === "ghost",
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
