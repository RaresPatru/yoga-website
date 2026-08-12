"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminLocale } from "@/components/admin/locale-provider";

interface Template {
  id: string;
  type: string;
  subject_ro: string;
  subject_en: string | null;
  body_ro: string;
  body_en: string | null;
}

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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ subject_ro: "", subject_en: "", body_ro: "", body_en: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("email_templates").select("*").order("type");
    if (data) setTemplates(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.from("email_templates").select("*").order("type").then(({ data }) => {
      if (cancelled) return;
      if (data) setTemplates(data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleEdit = (tpl: Template) => {
    setEditing(tpl.id);
    setForm({ subject_ro: tpl.subject_ro, subject_en: tpl.subject_en || "", body_ro: tpl.body_ro, body_en: tpl.body_en || "" });
  };

  const handleSave = async (type: string) => {
    const supabase = createClient();
    await supabase.from("email_templates").update(form).eq("type", type);
    setEditing(null);
    load();
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
                      className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-sm text-charcoal backdrop-blur-sm focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-charcoal-light">Body (EN)</label>
                    <textarea
                      value={form.body_en}
                      onChange={(e) => setForm({...form, body_en: e.target.value})}
                      rows={6}
                      className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-sm text-charcoal backdrop-blur-sm focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleSave(tpl.type)}>{t("admin.save")}</Button>
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
