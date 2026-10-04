"use client";

import { use } from "react";
import Link from "next/link";
import { adminErrorKey } from "@/lib/admin/db";
import { loadEvent } from "@/lib/admin/events";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { EventEditor } from "@/components/admin/events/event-editor";

/** An existing event, with any unpublished changes and its numbers. */
export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useAdminLocale();
  const { data, error, loading } = useAdminData(() => loadEvent(id), id);

  if (loading) return <div className="min-h-[60vh]" aria-busy="true" />;
  if (error) {
    return (
      <p role="alert" className="text-error">
        {t(adminErrorKey(error))}
      </p>
    );
  }
  if (!data) {
    return (
      <div className="py-16 text-center">
        <p className="text-charcoal-light">{t("admin.event_editor.not_found")}</p>
        <Link href="/admin/events" className="mt-4 inline-block text-rose-deep underline underline-offset-2">
          {t("admin.event_editor.back")}
        </Link>
      </div>
    );
  }
  // Keyed by id, so opening another event starts a fresh editor.
  return <EventEditor key={id} initial={data} />;
}
