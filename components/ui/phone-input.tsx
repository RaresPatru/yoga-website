"use client";

import { useState, useCallback } from "react";
import { parsePhoneNumberWithError, getCountries, getCountryCallingCode, CountryCode } from "libphonenumber-js";
import { cn } from "@/lib/utils";

const COUNTRIES: { code: CountryCode; label: string }[] = getCountries()
  .map((c) => ({ code: c, label: `${c} (+${getCountryCallingCode(c)})` }))
  .sort((a, b) => a.label.localeCompare(b.label));

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

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="text-sm font-medium text-charcoal-light">{label}</label>
      )}
      <div className="flex gap-2">
        <select
          value={country}
          onChange={handleCountryChange}
          className="w-28 shrink-0 rounded-xl border border-sage/30 bg-white/60 px-3 py-3 text-sm text-charcoal backdrop-blur-sm focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="tel"
          value={value}
          onChange={handlePhoneChange}
          placeholder="+40 7XX XXX XXX"
          required={required}
          className={cn(
            "flex-1 rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal",
            "placeholder:text-charcoal-light/50 backdrop-blur-sm",
            "focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20",
            "transition-all duration-200",
            (error || phoneError) && "border-error focus:border-error focus:ring-error/20"
          )}
        />
      </div>
      {(error || phoneError) && <p className="text-sm text-error">{error || phoneError}</p>}
    </div>
  );
}
