"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";

interface Testimonial {
  id: string;
  type: string;
  content: string;
  approved: boolean;
  created_at: string;
  user_id: string | null;
  event_id: string;
}

export default function AdminTestimonialsPage() {
  const { t } = useAdminLocale();
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("testimonials")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setTestimonials(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string, approved: boolean) => {
    const supabase = createClient();
    await supabase.from("testimonials").update({ approved }).eq("id", id);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("admin.confirm_delete_testimonial"))) return;
    const supabase = createClient();
    await supabase.from("testimonials").delete().eq("id", id);
    load();
  };

  return (
    <div>
      <h1 className="font-serif text-2xl text-charcoal">{t("admin.testimonials")}</h1>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      ) : testimonials.length === 0 ? (
        <p className="mt-6 text-charcoal-light">{t("admin.no_testimonials")}</p>
      ) : (
        <div className="mt-6 space-y-3">
          {testimonials.map((testimonial) => (
            <GlassCard key={testimonial.id} hover={false}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-sage/10 px-2 py-0.5 text-xs text-sage">
                      {testimonial.type}
                    </span>
                    {testimonial.approved ? (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">{t("admin.approved")}</span>
                    ) : (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">{t("admin.unapproved")}</span>
                    )}
                  </div>
                  <p className="mt-2 text-charcoal">{testimonial.content}</p>
                </div>
                <div className="ml-4 flex gap-2">
                  {!testimonial.approved && (
                    <Button variant="ghost" size="sm" onClick={() => handleApprove(testimonial.id, true)}>
                      <Check className="h-4 w-4 text-success" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(testimonial.id)}>
                    <X className="h-4 w-4 text-error" />
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
