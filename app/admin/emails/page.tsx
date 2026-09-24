"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { adminErrorKey, must, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useToast } from "@/components/admin/ui/toaster";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminLocale } from "@/components/admin/locale-provider";

type Template = Database["public"]["Tables"]["email_templates"]["Row"];

const typeLabelKey: Record<string, string> = {
  registration_confirmation: "admin.registration_confirmation",
  payment_confirmation: "admin.payment_confirmation",
  testimonial_request: "admin.testimonial_request",
  spot_available: "admin.spot_available",
};

/**
 * The set of template types lives in the database, behind a CHECK constraint,
 * so it can grow without this file changing. When that happened — a
 * `spot_available` row was added for the waiting-list email — the lookup
 * returned `undefined`, `t()` called `.split(".")` on it, and the whole page
 * threw rather than rendering three templates and one odd label.
 *
 * Falling back to the raw type keeps an unlabelled template editable, which is
 * the useful failure: the instructor sees "spot_available" instead of a blank
 * screen, and the missing translation is obvious rather than fatal.
 */
function labelFor(type: string, t: (key: string) => string): string {
  const key = typeLabelKey[type];
  return key ? t(key) : type;
}

export default function AdminEmailsPage() {
  const { t } = useAdminLocale();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ subject_ro: "", subject_en: "", body_ro: "", body_en: "" });
  const [saving, setSaving] = useState(false);

  const { data: templates = [], loading, error: loadError, reload } = useAdminData(async () => {
    const supabase = createClient();
    return must(await supabase.from("email_templates").select("*").order("type")) ?? [];
  });

  const handleEdit = (tpl: Template) => {
    setEditing(tpl.id);
    setForm({ subject_ro: tpl.subject_ro, subject_en: tpl.subject_en || "", body_ro: tpl.body_ro, body_en: tpl.body_en || "" });
  };

  /**
   * Saves the template. On failure the editor stays open with the text (audit
   * B5); English left blank is stored as NULL, which means "send the Romanian".
   */
  const handleSave = async (type: string) => {
    if (!form.subject_ro.trim() || !form.body_ro.trim()) {
      toast.error(t("admin.errors.missing"));
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      must(
        await supabase
          .from("email_templates")
          .update({
            subject_ro: form.subject_ro,
            subject_en: form.subject_en.trim() || null,
            body_ro: form.body_ro,
            body_en: form.body_en.trim() || null,
          })
          .eq("type", type)
      );
      toast.success(t("admin.toast.saved"));
      setEditing(null);
      void reload();
    } catch (error) {
      toast.error(t(adminErrorKey(toAdminError(error))));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="font-serif text-2xl text-charcoal">{t("admin.email_templates")}</h1>
      <p className="mt-2 text-sm text-charcoal-light">
        {t("admin.available_variables")} <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}user_name{'}'}{'}'}</code>, <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}event_name{'}'}{'}'}</code>, <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}event_date{'}'}{'}'}</code>, <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}event_time{'}'}{'}'}</code>, <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}event_location{'}'}{'}'}</code>, <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}whatsapp_link{'}'}{'}'}</code>
      </p>
      {/*
        Listed separately because they are substituted only in the waiting-list
        email — putting them in the line above would suggest they work
        everywhere, and an unrecognised placeholder renders literally rather
        than failing, so the mistake would reach an attendee's inbox.
      */}
      <p className="mt-1 text-sm text-charcoal-light">
        {t("admin.waiting_list_variables")} <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}claim_url{'}'}{'}'}</code>, <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}expires_at{'}'}{'}'}</code>
      </p>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      ) : loadError ? (
        <p role="alert" className="mt-8 text-error">{t(adminErrorKey(loadError))}</p>
      ) : (
        <div className="mt-6 space-y-4">
          {templates.map((tpl) => (
            <GlassCard key={tpl.id} hover={false}>
              {editing === tpl.id ? (
                <div className="space-y-4">
                  <h3 className="font-serif text-lg text-charcoal">{labelFor(tpl.type, t)}</h3>
                  <Input label="Subiect (RO)" value={form.subject_ro} onChange={(e) => setForm({...form, subject_ro: e.target.value})} />
                  <Input label="Subject (EN)" value={form.subject_en} onChange={(e) => setForm({...form, subject_en: e.target.value})} />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-charcoal-light">Corp (RO)</label>
                    <textarea
                      value={form.body_ro}
                      onChange={(e) => setForm({...form, body_ro: e.target.value})}
                      rows={6}
                      className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-sm text-charcoal backdrop-blur-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-charcoal-light">Body (EN)</label>
                    <textarea
                      value={form.body_en}
                      onChange={(e) => setForm({...form, body_en: e.target.value})}
                      rows={6}
                      className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-sm text-charcoal backdrop-blur-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleSave(tpl.type)} disabled={saving}>
                      {saving ? t("admin.saving") : t("admin.save")}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>{t("admin.cancel")}</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-charcoal">{labelFor(tpl.type, t)}</h3>
                    <p className="mt-1 text-sm text-charcoal-light">{tpl.subject_ro}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(tpl)}>{t("admin.edit")}</Button>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
