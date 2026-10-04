"use client";

import { useEffect, useRef } from "react";
import { track } from "@/components/providers/analytics";

/** A quarter of the post's reading time, between these bounds. */
const AT_LEAST_MS = 10_000;
const AT_MOST_MS = 60_000;

/**
 * Records a post as read (blog_post_read) once the end of its text has come
 * into view and the reader has spent at least a quarter of its reading time
 * on the page: never less than 10 seconds, never more than a minute. Reaching
 * the end in one quick scroll, on the way to something else, is not reading
 * it. Once per page view.
 *
 * Rendered right after the article, so the line it watches is the end of the
 * text.
 */
export function ReadTracker({ slug, readingMinutes }: { slug: string; readingMinutes: number | null }) {
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = end.current;
    if (!node || !("IntersectionObserver" in window)) return;

    const opened = performance.now();
    const needed = Math.min(AT_MOST_MS, Math.max(AT_LEAST_MS, (readingMinutes ?? 0) * 15_000));
    let reachedEnd = false;
    let recorded = false;
    let timer: number | undefined;

    const record = () => {
      if (recorded || !reachedEnd || timer !== undefined) return;
      const left = needed - (performance.now() - opened);
      if (left > 0) {
        timer = window.setTimeout(() => {
          timer = undefined;
          record();
        }, left);
        return;
      }
      recorded = true;
      observer.disconnect();
      track("blog_post_read", { post_slug: slug, reading_minutes: readingMinutes });
    };

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        reachedEnd = true;
        record();
      }
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [slug, readingMinutes]);

  return <div ref={end} aria-hidden="true" className="h-px" />;
}
