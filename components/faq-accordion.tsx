"use client";

import type { MouseEvent, ReactNode } from "react";

/*
 * Opening and closing the FAQ's answers smoothly, in the browsers that cannot
 * do it with CSS.
 *
 * Chromium animates a <details> by itself: app/globals.css ("THE FAQ") lets
 * the answer's box grow from nothing to its natural height, which needs
 * `interpolate-size` and `::details-content`. Safari has neither, and Safari
 * is most of the people reading this page, so there a tap on a question is
 * taken over here and the height is animated with the Web Animations API:
 * measured before and after, then eased between the two.
 *
 * Nothing is taken over when the visitor asked for less motion, or where CSS
 * already does it; before this script loads, a question simply opens.
 */

const DURATION_MS = 320;
/* The same curve as the page transitions: quick to start, slow to settle. */
const EASING = "cubic-bezier(0.2, 0.7, 0.2, 1)";

/** The height animation in progress on each question, so a second tap can turn it round. */
const running = new WeakMap<HTMLDetailsElement, Animation>();

function cssAnimates(): boolean {
  return CSS.supports("interpolate-size", "allow-keywords") && CSS.supports("selector(::details-content)");
}

function prefersLessMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Opens or closes one question, from whatever height it has now: a tap in
 * the middle of an animation turns it round instead of starting over.
 *
 * `data-closing` marks the time a closing question is still open, so the ×
 * can turn back into a + as the answer starts to fold rather than after.
 */
function toggle(details: HTMLDetailsElement, summary: HTMLElement) {
  const from = details.getBoundingClientRect().height;
  running.get(details)?.cancel();
  const answer = summary.nextElementSibling as HTMLElement | null;
  const closing = details.open && !details.hasAttribute("data-closing");

  let to: number;
  if (closing) {
    details.setAttribute("data-closing", "");
    // The question's own row, plus the hairline above it.
    to = summary.offsetHeight + (details.offsetHeight - details.clientHeight);
  } else {
    details.removeAttribute("data-closing");
    details.open = true;
    to = details.offsetHeight;
  }

  details.style.overflow = "hidden";
  const animation = details.animate({ height: [`${from}px`, `${to}px`] }, { duration: DURATION_MS, easing: EASING });
  answer?.animate({ opacity: closing ? [1, 0] : [0, 1] }, { duration: DURATION_MS, easing: EASING });
  running.set(details, animation);

  animation.onfinish = () => {
    running.delete(details);
    details.style.overflow = "";
    if (closing) {
      details.open = false;
      details.removeAttribute("data-closing");
    }
  };
}

/** The box around the questions; one listener serves every question in it. */
export function FaqAccordion({ children }: { children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const summary = event.target instanceof Element ? event.target.closest("summary") : null;
    if (!summary || !event.currentTarget.contains(summary)) return;
    const details = summary.parentElement;
    if (!(details instanceof HTMLDetailsElement)) return;
    if (cssAnimates() || prefersLessMotion()) return;
    event.preventDefault();
    toggle(details, summary);
  };

  return (
    <div className="faq-list" onClick={onClick}>
      {children}
    </div>
  );
}
