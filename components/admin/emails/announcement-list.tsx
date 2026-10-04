"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Megaphone } from "lucide-react";
import { adminErrorKey, toAdminError } from "@/lib/admin/db";
import { createAnnouncement, listAnnouncements, type AnnouncementListRow } from "@/lib/admin/emails";
import { countSentence } from "@/lib/admin/plural";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { Button } from "@/components/ui/button";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useToast } from "@/components/admin/ui/toaster";
import { shortDay } from "@/components/admin/participants/status-chip";

/**
 * Announcements: the drafts she is writing, then the ones sent, newest first,
 * with how many people each reached. Each row opens it: a draft in its
 * editor, a sent one in its report.
 */
export function AnnouncementList() {
  const { t, locale } = useAdminLocale();
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";
  const { data: rows = [], loading, error } = useAdminData(listAnnouncements);

  if (error) {
    return (
      <p role="alert" className="text-error">
        {t(adminErrorKey(error))}
      </p>
    );
  }
  if (loading) return <p className="text-charcoal-light">{t("admin.loading")}</p>;

  const drafts = rows.filter((row) => row.status === "draft");
  const sent = rows.filter((row) => row.status !== "draft");

  const row = (item: AnnouncementListRow) => {
    const subject = item.subject_ro?.trim() || t("admin.announce.untitled");
    const details =
      item.status === "draft"
        ? [t("admin.announce.started").replace("{date}", shortDay(item.created_at ?? "", lang))]
        : [
            item.status === "sending"
              ? t("admin.announce.sending_state")
              : t("admin.announce.sent_on").replace("{date}", shortDay(item.sent_at ?? "", lang)),
            countSentence(t, lang, "admin.announce.reached", item.sent_count ?? 0),
            (item.failed_count ?? 0) > 0 ? countSentence(t, lang, "admin.announce.failed", item.failed_count ?? 0) : null,
            (item.excluded_count ?? 0) > 0 ? countSentence(t, lang, "admin.announce.left_out", item.excluded_count ?? 0) : null,
          ];
    return (
      <li
        key={item.id}
        className="relative px-5 py-4 transition-colors has-[[data-row-link]:hover]:bg-rose/5 has-[[data-row-link]:focus-visible]:outline-2 has-[[data-row-link]:focus-visible]:-outline-offset-2 has-[[data-row-link]:focus-visible]:outline-rose-deep"
      >
        <Link
          href={`/admin/emails/announcements/${item.id}`}
          data-row-link
          className="block break-words font-serif text-lg leading-snug text-charcoal after:absolute after:inset-0 focus-visible:outline-none"
        >
          {subject}
        </Link>
        <p className="mt-1 text-sm text-charcoal-light">{details.filter(Boolean).join(". ")}.</p>
      </li>
    );
  };

  return (
    <div className="space-y-10">
      <p className="max-w-prose text-sm text-charcoal-light">{t("admin.announce.intro")}</p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sage/40 px-6 py-10 text-center">
          <p className="text-charcoal-light">{t("admin.announce.empty")}</p>
          <div className="mt-4 flex justify-center">
            <NewAnnouncementButton />
          </div>
        </div>
      ) : (
        <>
          {drafts.length > 0 && (
            <section aria-labelledby="announcements-drafts">
              <h2 id="announcements-drafts" className="font-serif text-xl text-charcoal">
                {t("admin.announce.drafts")}
              </h2>
              <ul className="mt-3 divide-y divide-sage/20 overflow-hidden rounded-2xl border border-sage/25 bg-warm-white">
                {drafts.map(row)}
              </ul>
            </section>
          )}
          {sent.length > 0 && (
            <section aria-labelledby="announcements-sent">
              <h2 id="announcements-sent" className="font-serif text-xl text-charcoal">
                {t("admin.announce.sent_list")}
              </h2>
              <ul className="mt-3 divide-y divide-sage/20 overflow-hidden rounded-2xl border border-sage/25 bg-warm-white">
                {sent.map(row)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Starts a draft for everyone who accepted announcements, and opens it. */
export function NewAnnouncementButton() {
  const { t } = useAdminLocale();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const id = await createAnnouncement({ kind: "all" });
          router.push(`/admin/emails/announcements/${id}`);
        } catch (failure) {
          toast.error(t(adminErrorKey(toAdminError(failure))));
          setBusy(false);
        }
      }}
    >
      <Megaphone className="mr-1.5 h-4 w-4" aria-hidden="true" />
      {t("admin.announce.new")}
    </Button>
  );
}
