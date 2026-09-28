"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TEMPLATE_GROUPS, TEMPLATES, VARIABLES, isVariableName, type EmailLocale } from "@/lib/email-content";
import { loadEmailSettings } from "@/lib/email-brand";
import { adminErrorKey } from "@/lib/admin/db";
import { listTemplates } from "@/lib/admin/emails";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { hasWords } from "./shared";

/**
 * The emails the site sends on its own, grouped in the order a booking lives
 * through them: booking, the waiting list, cancelling, after the event. Each
 * says when it goes and what its subject says; the whole row opens its
 * editor. Above them, the name they are sent with and where replies go.
 */
export function TemplateList() {
  const { t, locale } = useAdminLocale();
  const ui: EmailLocale = locale === "en" ? "en" : "ro";
  const { data, loading, error } = useAdminData(async () => {
    const [rows, settings] = await Promise.all([
      listTemplates(),
      loadEmailSettings(createClient(), window.location.origin),
    ]);
    return { rows, settings };
  });

  if (error) {
    return (
      <p role="alert" className="text-error">
        {t(adminErrorKey(error))}
      </p>
    );
  }
  if (loading || !data) return <p className="text-charcoal-light">{t("admin.loading")}</p>;

  const { rows, settings } = data;
  const name = settings.brand.siteName;
  const asWords = (text: string) =>
    text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => `[${isVariableName(key) ? VARIABLES[key].label[ui] : key}]`);

  return (
    <div className="space-y-10">
      <p className="rounded-2xl border border-sage/25 bg-warm-white px-5 py-4 text-sm leading-relaxed text-charcoal">
        {settings.replyTo
          ? t("admin.mail.sender").replace("{name}", name).replace("{address}", settings.replyTo)
          : t("admin.mail.sender_no_reply").replace("{name}", name)}{" "}
        <Link
          href="/admin/content/emails"
          className="font-medium text-rose-deep underline decoration-rose-deep/40 underline-offset-2 hover:decoration-rose-deep"
        >
          {settings.replyTo ? t("admin.mail.sender_change") : t("admin.mail.sender_add")}
        </Link>
      </p>

      {TEMPLATE_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`emails-${group.id}`}>
          <h2 id={`emails-${group.id}`} className="font-serif text-xl text-charcoal">
            {group.title[ui]}
          </h2>
          <ul className="mt-3 divide-y divide-sage/20 overflow-hidden rounded-2xl border border-sage/25 bg-warm-white">
            {group.types.map((type) => {
              const row = rows.find((r) => r.type === type);
              const def = TEMPLATES[type];
              const englishMissing = row && !row.subject_en?.trim() && !hasWords(row.body_en ?? "");
              return (
                <li
                  key={type}
                  className="relative px-5 py-4 transition-colors has-[[data-row-link]:hover]:bg-rose/5 has-[[data-row-link]:focus-visible]:outline-2 has-[[data-row-link]:focus-visible]:-outline-offset-2 has-[[data-row-link]:focus-visible]:outline-rose-deep"
                >
                  <Link
                    href={`/admin/emails/${type}`}
                    data-row-link
                    className="font-serif text-lg leading-snug text-charcoal after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {def.label[ui]}
                  </Link>
                  <p className="mt-1 max-w-prose text-sm text-charcoal-light">{def.when[ui]}</p>
                  {row ? (
                    <p className="mt-2 break-words text-sm text-charcoal">
                      <span className="text-charcoal-light">{t("admin.mail.subject")}: </span>
                      {asWords(row.subject_ro)}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-error">{t("admin.mail.not_found")}</p>
                  )}
                  {englishMissing && <p className="mt-1 text-xs text-charcoal-light">{t("admin.mail.english_missing")}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
