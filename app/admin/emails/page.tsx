"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Template {
  id: string;
  type: string;
  subject_ro: string;
  subject_en: string | null;
  body_ro: string;
  body_en: string | null;
}

const typeLabels: Record<string, string> = {
  registration_confirmation: "Confirmare înscriere",
  payment_confirmation: "Confirmare plată",
  testimonial_request: "Cerere testimonial",
};

export default function AdminEmailsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ subject_ro: "", subject_en: "", body_ro: "", body_en: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("email_templates").select("*");
    if (data) setTemplates(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEdit = (t: Template) => {
    setEditing(t.id);
    setForm({ subject_ro: t.subject_ro, subject_en: t.subject_en || "", body_ro: t.body_ro, body_en: t.body_en || "" });
  };

  const handleSave = async (type: string) => {
    const supabase = createClient();
    await supabase.from("email_templates").update(form).eq("type", type);
    setEditing(null);
    load();
  };

  return (
    <div>
      <h1 className="font-serif text-2xl text-charcoal">Template-uri Email</h1>
      <p className="mt-2 text-sm text-charcoal-light">
        Variabile disponibile: <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}user_name{'}'}{'}'}</code>, <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}event_name{'}'}{'}'}</code>, <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}event_date{'}'}{'}'}</code>, <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}event_time{'}'}{'}'}</code>, <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}event_location{'}'}{'}'}</code>, <code className="rounded bg-white/60 px-1 text-xs">{'{'}{'{'}whatsapp_link{'}'}{'}'}</code>
      </p>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {templates.map((t) => (
            <GlassCard key={t.id} hover={false}>
              {editing === t.id ? (
                <div className="space-y-4">
                  <h3 className="font-serif text-lg text-charcoal">{typeLabels[t.type]}</h3>
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
                    <Button onClick={() => handleSave(t.type)}>Salvează</Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>Anulează</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-charcoal">{typeLabels[t.type]}</h3>
                    <p className="mt-1 text-sm text-charcoal-light">{t.subject_ro}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(t)}>Editează</Button>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
