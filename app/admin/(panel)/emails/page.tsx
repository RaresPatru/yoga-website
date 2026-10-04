"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";
import { TemplateList } from "@/components/admin/emails/template-list";
import { AnnouncementList, NewAnnouncementButton } from "@/components/admin/emails/announcement-list";

/**
 * Email-uri, in two tabs:
 *
 *   Automate   The emails the site sends on its own, each with when it goes;
 *              each opens its editor (/admin/emails/<type>).
 *   Anunțuri   The emails she writes to the people who asked for news, and
 *              the history of the ones sent (?tab=announcements).
 */

const TABS = ["automatic", "announcements"] as const;
type Tab = (typeof TABS)[number];

function Emails() {
  const { t } = useAdminLocale();
  useDocumentTitle(t("admin.emails"));
  const params = useSearchParams();
  const pathname = usePathname();
  const tab: Tab = params.get("tab") === "announcements" ? "announcements" : "automatic";

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <PageHeader
        title={t("admin.emails")}
        description={t("admin.mail.intro")}
        actions={tab === "announcements" ? <NewAnnouncementButton /> : undefined}
      />

      <nav aria-label={t("admin.mail.tabs")} className="-mx-1 mb-8 overflow-x-auto px-1">
        <ul className="flex w-max gap-1 rounded-full border border-sage/25 bg-warm-white p-1">
          {TABS.map((value) => (
            <li key={value}>
              <Link
                href={value === "automatic" ? pathname : `${pathname}?tab=${value}`}
                aria-current={tab === value ? "page" : undefined}
                scroll={false}
                className={cn(
                  "flex h-10 items-center rounded-full px-4 text-sm transition-colors",
                  tab === value ? "bg-charcoal text-cream" : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
                )}
              >
                {t(`admin.mail.tab_${value}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "automatic" ? <TemplateList /> : <AnnouncementList />}
    </div>
  );
}

export default function AdminEmailsPage() {
  // useSearchParams needs a boundary of its own (CLAUDE.md).
  return (
    <Suspense>
      <Emails />
    </Suspense>
  );
}
