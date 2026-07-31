"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const toggleLocale = () => {
    const next = locale === "ro" ? "en" : "ro";
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  };

  const label =
    locale === "ro"
      ? "Switch to English"
      : "Treci la română";

  return (
    <button
      onClick={toggleLocale}
      disabled={isPending}
      aria-label={label}
      title={label}
      className="flex items-center gap-1.5 rounded-full bg-white/40 px-3 py-1.5 text-sm text-charcoal-light backdrop-blur-sm transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50"
    >
      <Globe className="h-4 w-4" />
      <span aria-hidden="true">{locale === "ro" ? "EN" : "RO"}</span>
    </button>
  );
}
