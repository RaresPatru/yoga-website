"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TurnstileProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  /**
   * The token the surrounding form is currently holding, if any.
   *
   * Pass this and the widget re-arms itself whenever the form throws its token
   * away — which is what every failed submit does. Without it the form reaches
   * a dead end that cannot be escaped without a page reload:
   *
   *   1. The widget verifies on load and collapses to `h-0 opacity-0 inert`.
   *   2. The visitor spends a few minutes writing their message. Turnstile
   *      tokens are single-use and expire after about five minutes.
   *   3. They submit. Cloudflare rejects the stale token
   *      ('timeout-or-duplicate' — see lib/turnstile.ts), the API answers 400,
   *      and the form clears its token.
   *   4. They press send again. The form says "complete the security check",
   *      but the widget is still collapsed and invisible, because as far as it
   *      knows it verified successfully in step 1.
   *
   * The visitor is then told to solve a CAPTCHA that is not on the page. This
   * is reported as "I can't send messages and it keeps asking about a captcha
   * that isn't showing up". It affects the booking form too, where the same
   * dead end sits on the Stripe path and quietly costs bookings.
   *
   * Optional, so existing callers that do not pass it keep their old behaviour.
   */
  token?: string | null;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
        theme?: "light" | "dark" | "auto";
        appearance?: "always" | "execute" | "interaction-only";
        refresh?: "auto" | "manual";
      }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export function Turnstile({ onVerify, onExpire, token }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (!window.turnstile || !containerRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
      // Named `issued` rather than `token` so it does not shadow the prop of
      // that name, which means something different: the token the *form* is
      // currently holding.
      callback: (issued: string) => {
        onVerifyRef.current(issued);
        setVerified(true);
      },
      "expired-callback": () => {
        onExpireRef.current?.();
        setVerified(false);
      },
      "error-callback": () => setVerified(false),
      refresh: "auto",
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, []);

  // Re-arm after the form discards its token, so a failed submit leaves the
  // visitor with a CAPTCHA they can actually solve. `reset` asks Cloudflare for
  // a fresh challenge; the callback above then fires again with a new token.
  //
  // `token === null` is deliberately narrower than falsy: a caller that omits
  // the prop entirely passes undefined, which must not trigger a reset.
  useEffect(() => {
    if (token !== null || !verified) return;
    if (!widgetIdRef.current || !window.turnstile) return;

    window.turnstile.reset(widgetIdRef.current);
    setVerified(false);
  }, [token, verified]);

  return (
    <div
      // Collapsed rather than unmounted once verified: the widget has to stay
      // alive so `refresh: "auto"` can keep the token fresh in the background.
      className={cn(
        "overflow-hidden transition-all duration-500",
        verified ? "h-0 opacity-0" : "h-[70px] opacity-100"
      )}
      // Height and opacity hide it visually but leave it in the tab order and
      // readable by screen readers — a keyboard user would tab into an
      // invisible iframe. `inert` removes it from both, and unlike aria-hidden
      // it is safe to put on a container that holds focusable elements.
      inert={verified}
      // Lets tests wait for verification to finish instead of guessing with a
      // timeout. Without a signal like this, a test either sleeps (slow and
      // flaky) or submits the form before the token exists.
      data-verified={verified ? "true" : "false"}
    >
      <div ref={containerRef} className="turnstile-widget" />
    </div>
  );
}
