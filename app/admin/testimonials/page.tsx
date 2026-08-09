"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  /** Optional 1-5. NULL means unrated, and no stars are drawn. */
  rating: number | null;
  author_name: string | null;
  video_url: string | null;
}

export default function AdminTestimonialsPage() {
  const { t, locale } = useAdminLocale();
  const ro = locale === "ro";
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);

  const updateLocal = (id: string, patch: Partial<Testimonial>) =>
    setTestimonials((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const saveDetails = async (item: Testimonial) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("testimonials")
      .update({
        author_name: item.author_name?.trim() || null,
        rating: item.rating,
        video_url: item.video_url?.trim() || null,
      })
      .eq("id", item.id);

    if (error) {
      alert(error.message);
      return;
    }
    setSavedId(item.id);
    window.setTimeout(() => setSavedId((id) => (id === item.id ? null : id)), 2000);
  };

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("testimonials")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setTestimonials(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("testimonials")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setTestimonials(data);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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

                  {/*
                   * Attribution and rating.
                   *
                   * The public submission form does not collect either — people
                   * leave a comment, not a form with a star widget — so these
                   * are filled in here, by her, from what the person actually
                   * said. Leaving the rating blank is a real choice: no stars
                   * are drawn rather than five being assumed, which is what the
                   * site used to do for every testimonial regardless.
                   */}
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="min-w-[12rem] flex-1">
                      <Input
                        label={ro ? "Nume" : "Name"}
                        value={testimonial.author_name ?? ""}
                        onChange={(e) => updateLocal(testimonial.id, { author_name: e.target.value })}
                        placeholder={ro ? "ex. Ana P." : "e.g. Ana P."}
                      />
                    </div>

                    <label className="flex flex-col gap-1.5 text-sm font-medium text-charcoal-light">
                      {ro ? "Rating" : "Rating"}
                      <select
                        value={testimonial.rating ?? ""}
                        onChange={(e) =>
                          updateLocal(testimonial.id, {
                            rating: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="h-12 rounded-xl border border-sage/30 bg-white/60 px-3 text-charcoal focus:border-rose-deep/50 focus:outline-none focus:ring-2 focus:ring-rose-deep/20"
                      >
                        <option value="">{ro ? "Fără" : "None"}</option>
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>

                    {testimonial.type === "video" && (
                      <div className="min-w-[16rem] flex-1">
                        <Input
                          label={ro ? "Link video" : "Video link"}
                          value={testimonial.video_url ?? ""}
                          onChange={(e) => updateLocal(testimonial.id, { video_url: e.target.value })}
                          placeholder={ro ? "Încarcă în Bibliotecă Media, apoi lipește linkul" : "Upload in Media Library, then paste the link"}
                        />
                      </div>
                    )}

                    <Button size="sm" onClick={() => saveDetails(testimonial)}>
                      {t("admin.save")}
                    </Button>
                    {savedId === testimonial.id && (
                      <span className="flex items-center gap-1 pb-3 text-sm text-success" role="status">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {ro ? "Salvat" : "Saved"}
                      </span>
                    )}
                  </div>
                </div>
                {/*
                 * These were icon-only buttons with no accessible name — a
                 * screen reader announced both as simply "button", giving no
                 * way to tell approve from delete. An aria-label is the whole
                 * fix, and it also lets tests target them by intent rather than
                 * by DOM position, which broke the moment another button was
                 * added to the card.
                 */}
                <div className="ml-4 flex gap-2">
                  {!testimonial.approved && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={ro ? "Aprobă testimonialul" : "Approve testimonial"}
                      onClick={() => handleApprove(testimonial.id, true)}
                    >
                      <Check className="h-4 w-4 text-success" aria-hidden="true" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={ro ? "Șterge testimonialul" : "Delete testimonial"}
                    onClick={() => handleDelete(testimonial.id)}
                  >
                    <X className="h-4 w-4 text-error" aria-hidden="true" />
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
