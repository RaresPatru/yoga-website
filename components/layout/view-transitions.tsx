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
 * A page's content, marking the change of page: when it arrives, React runs
 * the navigation through the View Transitions API, and the screen breathes
 * (app/globals.css animates the root: the old view fades out, the new one
 * fades in rising a few pixels).
 *
 * In every page rather than once in the layout, because a layout stays put
 * between pages, and a boundary that stays put never enters.
 *
 * WHY THE PAGE ITSELF IS NOT ANIMATED
 *
 * Its class is `none`, so React leaves it unnamed and the browser does not
 * take a picture of it. A named element is captured whole, and a page is
 * several screens tall: on WebKit, drawing without a GPU, capturing the page
 * took a median of 1.6 to 3.4 s before the new page could show (once 83 s),
 * and stalled 2 navigations in 24. The root is captured at the size of the
 * screen: a median of 0.45 to 0.62 s there, and none stalled in 36. On a
 * phone the whole-page picture would cost memory on every tap even where it
 * is quick.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return <ViewTransition default="none">{children}</ViewTransition>;
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
