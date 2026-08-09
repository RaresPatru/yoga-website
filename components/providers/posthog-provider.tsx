"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

/**
 * Records a pageview whenever the route changes.
 *
 * Split into its own component for one reason: `useSearchParams()` forces
 * everything above it into a Suspense boundary. That boundary used to live in
 * app/layout.tsx and wrapped `{children}` — meaning the entire application.
 *
 * The consequence was not a rendering bug but an HTTP one. With the whole app
 * inside Suspense, Next.js flushes the document shell immediately and streams
 * the rest. Headers go out with the shell, so by the time a page deeper in the
 * tree called `notFound()`, the response status was already committed as 200.
 * Every missing event and article answered "200 OK" while displaying a 404 —
 * a soft 404, which search engines may index as a real page, filling the index
 * with thin duplicates of deleted events.
 *
 * Keeping the boundary around this tracker alone lets the pages below render to
 * completion before anything is sent, so `notFound()` can still set the status.
 * Analytics loses nothing: this renders null and only fires an effect.
 */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (posthog.__loaded) {
      const query = searchParams?.toString();
      posthog.capture("$pageview", {
        $current_url: `${pathname}${query ? `?${query}` : ""}`,
      });
    }
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // Initialisation needs no search params, so it stays outside the boundary.
  useEffect(() => {
    if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
        capture_pageview: false,
      });
    }
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}
