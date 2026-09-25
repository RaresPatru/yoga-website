"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CONTENT_SECTIONS, sectionById } from "@/lib/site-content-schema";
import { useLeaveGuard } from "@/lib/admin/use-leave-guard";
import { cn } from "@/lib/utils";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { PageHeader } from "@/components/admin/ui/page-header";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { SectionEditor } from "./section-editor";
import { FaqEditor } from "./faq-editor";

/**
 * "Conținut site": a menu of sections and the one on screen.
 *
 * Each section has its own address (/admin/content/home), so the back button,
 * a reload and a bookmark all land on the same section. On a computer the
 * menu is a column beside the form; on a phone it is a dropdown above it. On
 * a wide screen the menu, with the page title above it, moves into the middle
 * of the space between the sidebar and the form (.admin-content-menu in
 * app/globals.css) instead of staying pressed against the form.
 * Leaving a section with unsaved changes asks first, whichever way she leaves.
 */
export function ContentScreen({ sectionId }: { sectionId: string }) {
  const { t, locale } = useAdminLocale();
  const ui = locale === "en" ? "en" : "ro";
  const confirm = useConfirm();
  const section = sectionById(sectionId)!;
  const [dirty, setDirty] = useState(false);

  useDocumentTitle(`${section.title[ui]} · ${t("admin.content")}`);

  const confirmLeave = useCallback(async () => {
    const { confirmed } = await confirm({
      title: t("admin.cms.leave_title"),
      body: t("admin.cms.leave_body"),
      confirmLabel: t("admin.cms.leave_confirm"),
      cancelLabel: t("admin.cms.leave_cancel"),
      tone: "danger",
    });
    return confirmed;
  }, [confirm, t]);

  const guardedPush = useLeaveGuard(dirty, confirmLeave);

  return (
    <div>
      <div className="admin-content-menu">
        <PageHeader title={t("admin.content")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label={t("admin.cms.sections")} className="admin-content-menu">
          <label htmlFor="content-section" className="sr-only">
            {t("admin.cms.section")}
          </label>
          <select
            id="content-section"
            value={section.id}
            onChange={(e) => void guardedPush(`/admin/content/${e.target.value}`)}
            className="w-full rounded-xl border border-sage/30 bg-white px-4 py-3 text-base text-charcoal lg:hidden"
          >
            {CONTENT_SECTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title[ui]}
              </option>
            ))}
          </select>
          <ul className="hidden space-y-1 lg:sticky lg:top-[calc(var(--admin-header-h)+2rem)] lg:block">
            {CONTENT_SECTIONS.map((item) => {
              const current = item.id === section.id;
              return (
                <li key={item.id}>
                  <Link
                    href={`/admin/content/${item.id}`}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 items-center rounded-xl px-3 text-sm transition-colors",
                      current
                        ? "bg-rose/15 font-medium text-rose-deep"
                        : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
                    )}
                  >
                    {item.title[ui]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section aria-labelledby="content-section-title" className="min-w-0">
          <h2 id="content-section-title" className="font-serif text-2xl text-charcoal">
            {section.title[ui]}
          </h2>
          <p className="mb-5 mt-1 max-w-prose text-sm text-charcoal-light">{section.description[ui]}</p>
          {section.kind === "faq" ? (
            <FaqEditor key={section.id} onDirtyChange={setDirty} />
          ) : (
            <SectionEditor key={section.id} section={section} onDirtyChange={setDirty} />
          )}
        </section>
      </div>
    </div>
  );
}
