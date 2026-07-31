"use client";

import { useSyncExternalStore } from "react";

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  loaded = true;
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  if (document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`)) {
    loaded = true;
  } else {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = emit;
    document.head.appendChild(script);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => loaded;
const getServerSnapshot = () => false;

export function useTurnstileScript(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
