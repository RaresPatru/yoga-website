/**
 * The look of an interactive item in an event's meta row.
 *
 * Two of the four things in that row do something — the date puts the class in
 * your calendar, the address opens a map — and two do not: the time and the
 * seat count are facts. Nothing distinguished them, so the working ones were
 * invisible.
 *
 * WHAT CARRIES THE AFFORDANCE, AND WHY THREE THINGS RATHER THAN ONE
 *
 * A phone has no hover, so whatever says "this does something" has to be
 * visible while nobody is touching anything:
 *
 *   the icon         already there, and now means "this is about time/place"
 *                    rather than decorating a label
 *   the underline    the oldest signal there is, and the only one that survives
 *                    being read in a screenshot
 *   the ink          `charcoal` against the row's `charcoal-light`, so the two
 *                    live items are a shade darker than the two dead ones
 *
 * Any one of them alone is ambiguous; together they are unmistakable without
 * either becoming a button. Hover then does one thing — the underline goes to
 * full strength — because on a pointer the cursor has already answered the
 * question.
 *
 * AND `active:`, BECAUSE HALF THIS AUDIENCE HAS NO HOVER
 *
 * Tailwind compiles `hover:` inside `@media (hover: hover)`, so on a phone the
 * hover rules do not exist at all and a tap produced no feedback whatsoever —
 * the finger covers the text, and on release the page had given no sign it
 * registered. `active:` is not gated that way and fires on touch, so the
 * underline thickens and the ink darkens for as long as the finger is down.
 *
 * IN ITS OWN MODULE, WITH NO "use client"
 *
 * The address is rendered on the server and the date is a client component, and
 * both need this exact string. A Server Component may render a client component
 * but may not import a value out of one — the same boundary that put
 * `buttonClasses` in lib/button-styles.ts rather than beside the Button.
 */
export const META_LINK =
  "flex items-center gap-2 rounded-sm text-charcoal underline decoration-sage-deep/50 " +
  "decoration-1 underline-offset-4 transition-[text-decoration-color,text-decoration-thickness,color] " +
  "duration-150 hover:decoration-sage-deep hover:decoration-2 " +
  "active:text-sage-deep active:decoration-sage-deep active:decoration-2";
