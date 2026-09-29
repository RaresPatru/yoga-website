import { ViewTransition, type ReactNode } from "react";

/*
 * The page transitions, as React sees them.
 *
 * Every navigation in the App Router is a React transition, and React runs a
 * <ViewTransition> boundary through the browser's View Transitions API when
 * one mounts or unmounts in it. What each boundary does is a class name; the
 * animations themselves are in app/globals.css, "PAGE TRANSITIONS", along
 * with the rules that keep the header still and switch it all off for
 * anyone who asked for less motion.
 *
 * `default="none"` everywhere: a boundary animates only for the reason given,
 * never because something inside it changed.
 */

/**
 * A page's content: it breathes out as the visitor leaves and in as they
 * arrive (fades out; fades in rising a few pixels).
 *
 * In every page rather than once in the layout, because a layout stays put
 * between pages, and a boundary that stays put never enters or exits.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * A photograph that is the same picture on a card and on the page the card
 * opens: the event's on its card and at the top of its page, a post's on its
 * card and at the top of the article. Sharing a name, the two become one
 * photograph that glides from the card into place.
 *
 * A name may be on the page only once at a time; an event is shown once on
 * any one page, and so is a post.
 */
export function PhotoTransition({
  kind,
  slug,
  children,
}: {
  kind: "event" | "post";
  slug: string;
  children: ReactNode;
}) {
  return (
    <ViewTransition name={photoTransitionName(kind, slug)} share="photo-glide" default="none">
      {children}
    </ViewTransition>
  );
}

/** A CSS name for the photograph: letters, digits, `-` and `_` only. */
export function photoTransitionName(kind: "event" | "post", slug: string): string {
  return `${kind}-photo-${slug.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}
