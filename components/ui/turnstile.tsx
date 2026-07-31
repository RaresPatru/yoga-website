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
      className={cn(
        "overflow-hidden transition-all duration-500",
        verified ? "h-0 opacity-0" : "h-[70px] opacity-100"
      )}
    >
      <div ref={containerRef} className="turnstile-widget" />
    </div>
  );
}
