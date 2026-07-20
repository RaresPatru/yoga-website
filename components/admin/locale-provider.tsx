"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

type Locale = "ro" | "en";
type Messages = Record<string, any>;

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
  const [locale, setLocaleState] = useState<Locale>("ro");
  const [messages, setMessages] = useState<Messages>({});

  useEffect(() => {
    const saved = localStorage.getItem("admin-locale") as Locale | null;
    if (saved === "ro" || saved === "en") {
      setLocaleState(saved);
    }
  }, []);

  useEffect(() => {
    import(`../../messages/${locale}.json`).then((mod) => setMessages(mod.default));
    localStorage.setItem("admin-locale", locale);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);

  const t = useCallback(
    (key: string): string => {
      const keys = key.split(".");
      let value: any = messages;
      for (const k of keys) {
        if (value && typeof value === "object" && k in value) {
          value = value[k];
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
