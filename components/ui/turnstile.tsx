"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TurnstileProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
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

export function Turnstile({ onVerify, onExpire }: TurnstileProps) {
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
      callback: (token: string) => {
        onVerifyRef.current(token);
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
