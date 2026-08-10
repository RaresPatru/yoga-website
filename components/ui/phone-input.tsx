"use client";

import { useState, useCallback, useId } from "react";
import { ChevronDown } from "lucide-react";
import { parsePhoneNumberWithError, getCountries, getCountryCallingCode, CountryCode } from "libphonenumber-js";
import { cn } from "@/lib/utils";

/**
 * The flag for an ISO 3166-1 alpha-2 country code, as an emoji.
 *
 * A flag emoji is not a character of its own: it is a pair of "regional
 * indicator symbols", one per letter of the country code. RO becomes
 * U+1F1F7 U+1F1F4, and the font draws the pair as one flag. So the whole
 * mapping is arithmetic — no image files, no icon package, no request to a
 * flag CDN (which would also mean a new Content Security Policy entry, and a
 * CSP mistake has already broken this site on iPhone once).
 *
 * The fallback is the reason this is safe to do. When a platform ships no flag
 * glyphs — Windows is the notable one — it draws the two letters instead, so
 * the control reads "RO +40" there and "🇷🇴 +40" on a phone. Both say the same
 * thing, which is why nothing here needs to detect support or branch on it. The
 * audience arrives overwhelmingly from Instagram on iOS and Android, where the
 * flags render properly.
 */
function flagEmoji(code: string): string {
  return String.fromCodePoint(
    ...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65)
  );
}

const COUNTRIES: { code: CountryCode; dial: string }[] = getCountries()
  .map((c) => ({ code: c, dial: getCountryCallingCode(c) }))
  // Sorted by country code, which is what the option text leads with — so the
  // list reads in the same order it is labelled, and a keyboard user typing
  // "R" in the native select lands where they expect.
  .sort((a, b) => a.code.localeCompare(b.code));

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidChange?: (valid: boolean) => void;
  label?: string;
  error?: string;
  className?: string;
  required?: boolean;
}

export function PhoneInput({ value, onChange, onValidChange, label, error, className, required }: PhoneInputProps) {
  const generatedId = useId();
  const [country, setCountry] = useState<CountryCode>("RO");
  const [phoneError, setPhoneError] = useState("");

  const validatePhone = useCallback((phone: string, ctry: CountryCode) => {
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
  }, [onChange, onValidChange]);

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ctry = e.target.value as CountryCode;
    setCountry(ctry);
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

  const errorId = error || phoneError ? `${generatedId}-error` : undefined;
  const dial = getCountryCallingCode(country);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={generatedId} className="text-sm font-medium text-charcoal-light">
          {label}
        </label>
      )}
      <div className="flex gap-2">
        {/*
          The country picker.

          It is a real <select>, kept for the reasons that matter: on a phone it
          opens the platform's own wheel picker, and it arrives with keyboard
          support, type-to-jump and screen-reader semantics that a hand-built
          listbox would have to reimplement and would get subtly wrong.

          What it is *not* is visible. A closed <select> can only display the
          text of the selected <option>, and that text has to serve two jobs at
          once: readable in a 240-entry list, and short enough for a 128px box.
          So the select is stretched over the whole control at opacity-0 and the
          span below draws what you actually see — flag and dialling code —
          while the options stay "RO +40", which is what makes the list
          scannable and lets a keyboard user press R to reach Romania.
        */}
        <div
          className={cn(
            "relative flex w-32 shrink-0 items-center gap-2 rounded-xl border border-sage/30",
            "bg-white/60 px-3 py-3 backdrop-blur-sm",
            "focus-within:border-rose/50 focus-within:ring-2 focus-within:ring-rose/20",
            (error || phoneError) && "border-error"
          )}
        >
          {/*
            aria-hidden: the select underneath already announces the country, so
            without this a screen reader reads it twice.
          */}
          <span aria-hidden="true" className="flex items-center gap-1.5 text-sm text-charcoal">
            <span className="text-base leading-none">{flagEmoji(country)}</span>+{dial}
          </span>
          <select
            value={country}
            onChange={handleCountryChange}
            aria-label="Country code"
            // Transparent rather than hidden. `opacity-0` leaves the control
            // focusable, announced, and clickable across the whole box;
            // display:none or visibility:hidden would take it out of the
            // accessibility tree and out of the tab order entirely.
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} +{c.dial}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none ml-auto h-4 w-4 shrink-0 text-charcoal-light"
          />
        </div>
        <input
          id={generatedId}
          type="tel"
          value={value}
          onChange={handlePhoneChange}
          placeholder="+40 7XX XXX XXX"
          autoComplete="tel"
          required={required}
          aria-invalid={error || phoneError ? true : undefined}
          aria-describedby={errorId}
          className={cn(
            // min-w-0 is load-bearing, not tidying.
            //
            // A flex item defaults to `min-width: auto`, which means it will not
            // shrink below its content's minimum — and an <input> reports a
            // minimum of roughly 20 characters (~250px). Together with the
            // 128px picker that gave this row a min-content width of 369px
            // inside a 310px card on a 390px-wide phone. Because the card is a
            // grid item, which also defaults to `min-width: auto`, the grid
            // could not shrink either: the whole page laid out 45px wider than
            // the screen and every event page scrolled sideways.
            //
            // See also the matching min-w-0 on the grid children in
            // app/[locale]/events/[slug]/page.tsx.
            "min-w-0 flex-1 rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal",
            "placeholder:text-charcoal-light/50 backdrop-blur-sm",
            "focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20",
            "transition-all duration-200",
            (error || phoneError) && "border-error focus:border-error focus:ring-error/20"
          )}
        />
      </div>
      {(error || phoneError) && (
        <p id={errorId} role="alert" className="text-sm text-error">
          {error || phoneError}
        </p>
      )}
    </div>
  );
}
