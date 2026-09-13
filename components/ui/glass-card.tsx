"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Whether the card lifts under a pointer.
   *
   * The rule is affordance, not decoration: a card lifts if and only if the
   * whole card is a link. Admin list rows pass `false` because they are
   * containers with their own buttons inside — lifting one would promise a click
   * that does nothing, and once some non-clickable cards move, the lift stops
   * meaning anything anywhere.
   */
  hover?: boolean;
}

/**
 * HOW THE LIFT MOVES, AND WHY THESE THREE NUMBERS
 *
 * Chosen after putting ten candidates on ten cards and hovering them. A spring
 * rather than a tween for one reason that matters more than the curve: Motion
 * integrates it frame by frame and keeps velocity across interruptions, so
 * sweeping the pointer over a row of cards resolves each from wherever it
 * actually was. A tween restarts its curve from the top every time, which is
 * what makes a fast sweep look mechanical.
 *
 * Read the numbers as a damping ratio rather than three independent dials —
 * that single value is what the motion actually feels like:
 *
 *   zeta = damping / (2 * sqrt(stiffness * mass)) = 30 / (2 * sqrt(300)) = 0.87
 *
 * Under 0.7 a spring visibly bounces, which reads as playful. Above 1.0 it is
 * dead — a slow slide with no life in it. 0.87 sits just below critical: the
 * card arrives, hesitates for a fraction of a pixel, and stops.
 *
 * What that produces, all of it measured rather than hoped for:
 *
 *   natural frequency ... sqrt(300 / 1) = 17.3 rad/s
 *   overshoot ........... exp(-pi * zeta / sqrt(1 - zeta^2)) = 0.43%
 *                         which on a 4px lift is 0.017px — below a pixel, so it
 *                         is felt as weight rather than seen as a bounce
 *   settles in .......... 4 / (zeta * omega) = 267ms
 *
 * `mass` is stated explicitly even though 1 is the default, because it is the
 * reference the other two are expressed against: doubling it while holding the
 * rest halves the frequency and makes the card feel heavy and slow. It is the
 * dial to reach for if the lift should ever feel more substantial, and the one
 * to leave alone otherwise.
 *
 * The earlier value was damping 20, a ratio of 0.58 and a 10.8% overshoot. That
 * was fine while the card only lifted 4px — but it was also scaling, and a
 * 10.8% overshoot on a scale is what made text visibly stretch and spring back.
 */
const HOVER_SPRING: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 1,
};

/**
 * How much the card grows.
 *
 * 1.02 moves all four edges outward by about 4px on a 400px card, which is a
 * bigger presence than the 4px lift this replaced — that only shifted the whole
 * card, this changes its size. Raising it is one number; 1.04 was tried in the
 * showcase and reads as showy on a card this large.
 */
const HOVER_SCALE = 1.02;

/**
 * The card used for everything on this site: dashboard tiles, event and blog
 * cards, admin list rows.
 *
 * IT SCALES, AND SCALING A CARD SCALES THE TEXT IN IT.
 *
 * That is not a bug to be fixed later; it is the cost of this effect, it was
 * measured before being accepted, and the numbers are here so nobody has to
 * rediscover them. Every line grows and both of its ends move outward:
 *
 *   event card description ... 303.9px -> 310.6px   (+6.7)
 *   event card title ......... 210.3px -> 215.0px   (+4.7)
 *   blog card date ........... 128.4px -> 131.2px   (+2.8)
 *   admin tile label .......... 77.1px ->  78.9px   (+1.7)
 *   admin tile number ......... 15.0px ->  15.3px   (+0.3)
 *
 * WHAT MAKES IT ACCEPTABLE NOW AND DID NOT BEFORE
 *
 * The complaint that started all of this was text "bouncing in place until the
 * hover finishes", and the bounce — not the growth — was the problem. The old
 * spring had a damping ratio of 0.58 and overshot by 10.8%, so every line
 * stretched past its final width and sprang back: a wobble, which reads as a
 * glitch. The spring above is 0.87 and overshoots by 0.43%, so each line grows
 * once, monotonically, and stops. A card that gets bigger is supposed to make
 * its contents bigger; that reads as growth rather than as a fault.
 *
 * So the thing to protect is the overshoot, not the scale.
 * tests/ui-consistency.spec.ts asserts the settled value is exactly 1.02 and
 * that the peak never passes 1.025 — if somebody retunes the spring into a
 * bouncy one, the text starts wobbling again and that test is what catches it.
 *
 * IF THE GROWTH EVER DOES NEED TO GO
 *
 * There is a way to have both, and it is a real refactor rather than a setting:
 * split the card into a surface layer (background, border, shadow, blur,
 * absolutely positioned) that scales, and a content layer that does not. The
 * card then appears to grow while the glyphs hold still. It was not done here
 * because the `className` every call site passes would have to be routed to one
 * layer or the other — `h-full` and `mt-8` belong to the outer box,
 * `overflow-hidden` and `flex-col` to the inner one — and getting that wrong is
 * a layout bug on twenty call sites in exchange for 6.7px.
 *
 * DO NOT ADD `transition-transform` OR `hover:scale-*` VIA `className`.
 *
 * Five call sites used to, and it broke the hover three ways at once — measured
 * against a dashboard tile, sampling every 100ms:
 *
 *   1. The scale doubled. Tailwind v4 compiles `hover:scale-[1.02]` to the
 *      individual `scale` property, which does not replace the `transform` this
 *      component writes — the two multiply. 1.02 x 1.02 = 1.0404.
 *   2. It ran roughly four times too slow. `transition-transform` puts a 300ms
 *      CSS ease on the very property the spring below is already animating
 *      frame by frame, so the spring became a moving target chased through a lag
 *      filter: ~1000ms to settle instead of ~250ms.
 *   3. The shadow stopped easing. `cn` is plain clsx with no tailwind-merge, so
 *      `transition-shadow` and `transition-transform` both survived and the
 *      cascade picked one: `transition-property` resolved to the transform set,
 *      dropping box-shadow, and `hover:shadow-xl` snapped instantly.
 *
 * This component already does the animation; anything added on top fights it.
 */
export function GlassCard({ children, className, hover = true }: GlassCardProps) {
  // `whileHover` is JavaScript, so unlike the `motion-safe:` variants used on
  // buttons it does not respect the OS setting on its own. Without this, someone
  // who has asked their phone to reduce motion still gets every card lifting and
  // scaling under their thumb. The shadow still responds — that is a change of
  // depth, not of movement, and reduced motion is about the latter.
  const reduceMotion = useReducedMotion();
  const lift = hover && !reduceMotion;

  return (
    <motion.div
      // The identity transform is deliberate and has to stay even though it
      // looks like a no-op. An element that only gets a transform on hover
      // creates its stacking context and containing block on hover too, so
      // anything positioned inside it can jump the moment a pointer arrives.
      // Declaring the resting state means the card is composited the same way
      // whether or not it is hovered.
      //
      // Only for the cards that actually animate, though. A transform is not
      // free even at identity: it makes the element a containing block for any
      // `position: fixed` descendant, which would silently anchor a fixed child
      // to the card instead of the viewport. About twenty call sites pass
      // `hover={false}` — both modals, the contact form, the sticky
      // registration panel, every admin list row — and none of them can ever
      // acquire a transform, so none of them need to be defended against one.
      style={lift ? { scale: 1, y: 0 } : undefined}
      whileHover={lift ? { scale: HOVER_SCALE } : undefined}
      transition={HOVER_SPRING}
      className={cn(
        "rounded-2xl border border-white/30 bg-white/60 p-6 shadow-lg shadow-black/5 backdrop-blur-xl",
        "transition-shadow duration-300 hover:shadow-xl hover:shadow-black/10",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
