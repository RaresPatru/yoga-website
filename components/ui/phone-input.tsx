"use client";

import { useState, useCallback, useId, useMemo, useRef, useEffect } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useLocale } from "next-intl";
import {
  parsePhoneNumberWithError,
  getCountries,
  getCountryCallingCode,
  CountryCode,
} from "libphonenumber-js";
import { Flag } from "@/components/ui/flag";
import { cn } from "@/lib/utils";

const COUNTRY_CODES: CountryCode[] = getCountries();

const DIAL_CODES = new Map<CountryCode, string>(
  COUNTRY_CODES.map((code) => [code, getCountryCallingCode(code)])
);

/**
 * Strip accents so "Romania" finds "România" and "espana" finds "España".
 *
 * NFD splits an accented letter into the base letter plus a combining mark,
 * and the regex then removes the marks. Without this, a Romanian visitor typing
 * their own country's name without diacritics — which is how most people type
 * on a phone — would get no results.
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidChange?: (valid: boolean) => void;
  label?: string;
  error?: string;
  className?: string;
  required?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  onValidChange,
  label,
  error,
  className,
  required,
}: PhoneInputProps) {
  const generatedId = useId();
  const locale = useLocale();
  const [country, setCountry] = useState<CountryCode>("RO");
  const [phoneError, setPhoneError] = useState("");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const t = (ro: string, en: string) => (locale === "ro" ? ro : en);

  /**
   * Country names in the visitor's language, from the browser's own data.
   *
   * Intl.DisplayNames means no translation table to maintain and no 240-entry
   * list to keep in step with libphonenumber. Built once per locale rather than
   * per render — constructing it is not free, and this list is rebuilt on every
   * keystroke in the search box.
   */
  const countries = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      // Very old engines, or a locale the runtime has no data for. The list
      // still works, just labelled by code.
    }

    return COUNTRY_CODES.map((code) => {
      let name: string = code;
      try {
        name = names?.of(code) ?? code;
      } catch {
        // Some libphonenumber "countries" (AC, TA) are not real regions.
      }
      const dial = DIAL_CODES.get(code)!;
      return { code, dial, name, haystack: `${fold(name)} ${code.toLowerCase()} ${dial}` };
    }).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);

  /**
   * Matches on name, ISO code or dialling code, so "romania", "ro", "40" and
   * "+40" all find the same row. The leading + is stripped because people type
   * it and it is not part of the stored code.
   */
  const results = useMemo(() => {
    const needle = fold(query.trim()).replace(/^\+/, "");
    if (!needle) return countries;
    return countries.filter((entry) => entry.haystack.includes(needle));
  }, [countries, query]);

  const selected = countries.find((entry) => entry.code === country);
  const dial = DIAL_CODES.get(country)!;

  const validatePhone = useCallback(
    (phone: string, ctry: CountryCode) => {
      if (!phone) {
        setPhoneError("");
        onValidChange?.(false);
        return;
      }
      try {
        const parsed = parsePhoneNumberWithError(phone, ctry);
        if (parsed.isValid()) {
          setPhoneError("");
          onValidChange?.(true);
          onChange(parsed.formatInternational());
        } else {
          setPhoneError("Număr de telefon invalid / Invalid phone number");
          onValidChange?.(false);
        }
      } catch {
        setPhoneError("Număr de telefon invalid / Invalid phone number");
        onValidChange?.(false);
      }
    },
    [onChange, onValidChange]
  );

  const chooseCountry = (ctry: CountryCode) => {
    setCountry(ctry);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
    if (value) validatePhone(value, ctry);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9+()\- ]/g, "");
    onChange(raw);
    if (raw.length >= 4) validatePhone(raw, country);
    else {
      setPhoneError("");
      onValidChange?.(false);
    }
  };

  /**
   * Opening the panel starts the highlight on the country already selected.
   *
   * Done here rather than in an effect watching `open`. Setting state inside an
   * effect means React renders the panel once, then immediately renders it
   * again with the right row highlighted — a visible flicker on a long list,
   * and the reason the React lint rule objects to it. Everything needed is
   * known at the moment of the click, so this belongs in the click.
   */
  const openPanel = () => {
    setQuery("");
    setActiveIndex(Math.max(0, countries.findIndex((entry) => entry.code === country)));
    setOpen(true);
  };

  // Moving focus is a DOM effect, not state, so it does belong here.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Close on a click anywhere else. `pointerdown` rather than `click` so the
  // panel is gone before the click lands on whatever is underneath.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted row in view when arrowing through a 240-entry list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const onSearchKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = results[activeIndex];
      if (choice) chooseCountry(choice.code);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const errorId = error || phoneError ? `${generatedId}-error` : undefined;
  const listboxId = `${generatedId}-countries`;
  const hasError = Boolean(error || phoneError);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={generatedId} className="text-sm font-medium text-charcoal-light">
          {label}
        </label>
      )}

      {/*
        `relative` on the row, not on the trigger, and that is deliberate: the
        dropdown below is anchored `left-0 right-0` to this element, so it is
        exactly as wide as the phone field and can never reach past the card it
        sits in. A native <select> could not do that — its options are drawn by
        the OS outside the page entirely, and on a desktop browser the 240-entry
        list spilled beyond the window.
      */}
      <div className="relative flex gap-2" ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? setOpen(false) : openPanel())}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          // The visible text is a flag and "+40", neither of which tells a
          // screen reader which country is selected — hence the spelled-out
          // name here.
          aria-label={`${t("Prefix țară", "Country code")}: ${selected?.name ?? country} +${dial}`}
          className={cn(
            "flex w-[6.5rem] shrink-0 items-center gap-1.5 rounded-xl border border-sage/30",
            "bg-white/60 px-3 py-3 text-sm text-charcoal backdrop-blur-sm",
            "focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20",
            hasError && "border-error"
          )}
        >
          <Flag code={country} />
          <span>+{dial}</span>
          <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-charcoal-light" />
        </button>

        <input
          id={generatedId}
          type="tel"
          value={value}
          onChange={handlePhoneChange}
          autoComplete="tel"
          required={required}
          aria-invalid={hasError ? true : undefined}
          aria-describedby={errorId}
          className={cn(
            // min-w-0 is load-bearing. A flex item will not shrink below its
            // content's minimum and an <input> claims about 20 characters, so
            // without this the row could not fit a phone and — because the card
            // is a grid item with the same default — it widened the whole page
            // instead of overflowing its own box.
            "min-w-0 flex-1 rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal",
            "placeholder:text-charcoal-light/50 backdrop-blur-sm",
            "focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20",
            "transition-all duration-200",
            hasError && "border-error focus:border-error focus:ring-error/20"
          )}
        />

        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-sage/30 bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b border-sage/20 px-3 py-2">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-charcoal-light" />
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={
                  results[activeIndex] ? `${generatedId}-opt-${results[activeIndex].code}` : undefined
                }
                aria-label={t("Caută țara", "Search country")}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={t("Țară sau prefix", "Country or code")}
                className="min-w-0 flex-1 bg-transparent text-sm text-charcoal placeholder:text-charcoal-light/60 focus:outline-none"
              />
            </div>

            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label={t("Țări", "Countries")}
              className="max-h-60 overflow-y-auto py-1"
            >
              {results.map((entry, index) => (
                <li key={entry.code}>
                  <button
                    type="button"
                    id={`${generatedId}-opt-${entry.code}`}
                    role="option"
                    aria-selected={entry.code === country}
                    data-index={index}
                    // pointerdown, not click: the outside-click handler above
                    // also runs on pointerdown, and a plain onClick would fire
                    // after the panel had already closed.
                    onPointerDown={(event) => {
                      event.preventDefault();
                      chooseCountry(entry.code);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-charcoal",
                      index === activeIndex && "bg-sage/15",
                      entry.code === country && "font-medium"
                    )}
                  >
                    <Flag code={entry.code} />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span className="shrink-0 text-charcoal-light">+{entry.dial}</span>
                  </button>
                </li>
              ))}

              {results.length === 0 && (
                <li className="px-3 py-3 text-sm text-charcoal-light">
                  {t("Nicio țară găsită", "No country found")}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {hasError && (
        <p id={errorId} role="alert" className="text-sm text-error">
          {error || phoneError}
        </p>
      )}
    </div>
  );
}
