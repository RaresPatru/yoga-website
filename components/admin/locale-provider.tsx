"use client";

import { createContext, useContext, useState, useEffect, useCallback, useSyncExternalStore, ReactNode } from "react";

type Locale = "ro" | "en";
type Messages = Record<string, unknown>;

const STORAGE_KEY = "admin-locale";
const listeners = new Set<() => void>();

function readLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ro";
  } catch {
    return "ro";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function writeLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // storage unavailable
  }
  for (const listener of listeners) listener();
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "ro",
  setLocale: () => {},
  t: (key: string) => key,
});

export function AdminLocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readLocale, () => "ro" as Locale);
  const [messages, setMessages] = useState<Messages>({});

  useEffect(() => {
    import(`../../messages/${locale}.json`)
      .then((mod) => setMessages(mod.default))
      .catch((err) => console.error("Failed to load locale messages:", err));
  }, [locale]);

  const setLocale = useCallback((l: Locale) => writeLocale(l), []);

  const t = useCallback(
    (key: string): string => {
      const keys = key.split(".");
      let value: unknown = messages;
      for (const k of keys) {
        if (value && typeof value === "object" && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          return key;
        }
      }
      return typeof value === "string" ? value : key;
    },
    [messages]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useAdminLocale() {
  return useContext(LocaleContext);
}
