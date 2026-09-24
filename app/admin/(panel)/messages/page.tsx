"use client";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { adminErrorKey, must, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useToast } from "@/components/admin/ui/toaster";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { GlassCard } from "@/components/ui/glass-card";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";

type Message = Database["public"]["Tables"]["contact_messages"]["Row"];

export default function AdminContactMessagesPage() {
  const { t } = useAdminLocale();
  useDocumentTitle(t("admin.messages"));
  const toast = useToast();
  const confirm = useConfirm();

  const { data: messages = [], loading, error: loadError, reload } = useAdminData(async () => {
    const supabase = createClient();
    return (
      must(
        await supabase.from("contact_messages").select("*").order("created_at", { ascending: false })
      ) ?? []
    );
  });

  const handleDelete = async (message: Message) => {
    const { confirmed } = await confirm({
      title: t("admin.confirm_delete_message"),
      body: message.name,
      confirmLabel: t("admin.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const supabase = createClient();
      must(await supabase.from("contact_messages").delete().eq("id", message.id));
      toast.success(t("admin.toast.deleted"));
      void reload();
    } catch (error) {
      toast.error(t(adminErrorKey(toAdminError(error))));
    }
  };

  return (
    <div>
      <PageHeader title={t("admin.messages")} />

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      ) : loadError ? (
        <p role="alert" className="text-error">{t(adminErrorKey(loadError))}</p>
      ) : messages.length === 0 ? (
        <p className="text-charcoal-light">{t("admin.no_messages")}</p>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <GlassCard key={m.id} hover={false}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-charcoal">{m.name}</p>
                  <p className="text-sm text-charcoal-light">{m.email} · {new Date(m.created_at).toLocaleString("ro-RO")}</p>
                  {m.subject && <p className="mt-1 text-sm font-medium text-charcoal">{m.subject}</p>}
                  <p className="mt-2 text-charcoal">{m.message}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${t("admin.delete")}: ${m.name}`}
                  onClick={() => handleDelete(m)}
                >
                  <Trash2 className="h-4 w-4 text-error" aria-hidden="true" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
