"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { countSentence } from "@/lib/admin/plural";
import { codeRecipients, type CodeRecipient } from "@/lib/admin/promotion-codes";
import type { PromotionCodeView } from "@/lib/promotion-codes";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { shortDay } from "@/components/admin/participants/status-chip";

/**
 * "Trimis pe email la 12 persoane", which opens into who: each person with
 * the announcement that reached them, a link to them on the Registrations
 * page, and whether they have paid with the code.
 *
 * Read when opened rather than with the list, because most codes are never
 * opened and the list is read every time the page is. Counted from the day
 * the code got its current word: someone who received the word it had
 * before an edit did not receive this one.
 */
export function CodeRecipients({ code }: { code: PromotionCodeView }) {
  const { t, locale } = useAdminLocale();
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";
  const [people, setPeople] = useState<CodeRecipient[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    if (people) return;
    setFailed(false);
    try {
      setPeople(await codeRecipients(code.code, code.wordSince));
    } catch {
      setFailed(true);
    }
  };

  return (
    <details
      className="group mt-2"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) void load();
      }}
    >
      {/* The flex box is inside the summary rather than the summary itself:
          older Safari ignored `display` on a <summary>. */}
      <summary className="w-max cursor-pointer list-none rounded-lg text-sm font-medium text-rose-deep hover:underline [&::-webkit-details-marker]:hidden">
        <span className="inline-flex min-h-10 items-center gap-1">
          <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
          {countSentence(t, lang, "admin.discounts.sent_to", code.sentTo)}
        </span>
      </summary>
      {failed ? (
        <p role="alert" className="mt-1 text-sm text-error">
          {t("admin.discounts.recipients_error")}
        </p>
      ) : !people ? (
        <p role="status" className="mt-1 text-sm text-charcoal-light">
          {t("admin.loading")}
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-sage/15 rounded-xl border border-sage/20 bg-white">
          {people.map((person) => (
            <li key={person.email} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
              <Link
                href={`/admin/registrations?q=${encodeURIComponent(person.email)}`}
                className="font-medium text-charcoal underline decoration-sage-deep/40 underline-offset-2 hover:decoration-sage-deep"
              >
                {person.fullName || person.email}
              </Link>
              <span className="min-w-0 break-all text-charcoal-light">{person.email}</span>
              <span className="text-charcoal-light">
                {t("admin.discounts.sent_in")
                  .replace("{subject}", person.subject || t("admin.announce.untitled"))
                  .replace("{date}", shortDay(person.sentAt, lang))}
              </span>
              {person.used && (
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  {t("admin.discounts.used_it")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
