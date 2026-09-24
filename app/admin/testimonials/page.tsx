"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { adminErrorKey, must, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useToast } from "@/components/admin/ui/toaster";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";

/** One testimonial. `rating` is an optional 1-5; NULL means unrated, and no stars are drawn. */
type Testimonial = Database["public"]["Tables"]["testimonials"]["Row"];

export default function AdminTestimonialsPage() {
  const { t, locale } = useAdminLocale();
  const ro = locale === "ro";
  const toast = useToast();
  const confirm = useConfirm();
  const [savedId, setSavedId] = useState<string | null>(null);

  const {
    data: testimonials = [],
    setData: setTestimonials,
    loading,
    error: loadError,
    reload,
  } = useAdminData(async () => {
    const supabase = createClient();
    return (
      must(
        await supabase.from("testimonials").select("*").order("created_at", { ascending: false })
      ) ?? []
    );
  });

  const updateLocal = (id: string, patch: Partial<Testimonial>) =>
    setTestimonials((prev) => prev?.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  /** Shows a failed write's reason; every write below goes through this. */
  const reportError = (error: unknown) => toast.error(t(adminErrorKey(toAdminError(error))));

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
      reportError(error);
      return;
    }
    setSavedId(item.id);
    window.setTimeout(() => setSavedId((id) => (id === item.id ? null : id)), 2000);
  };

  const handleApprove = async (id: string, approved: boolean) => {
    try {
      const supabase = createClient();
      must(await supabase.from("testimonials").update({ approved }).eq("id", id));
      toast.success(t("admin.toast.approved"));
      void reload();
    } catch (error) {
      reportError(error);
    }
  };

  const handleDelete = async (testimonial: Testimonial) => {
    const { confirmed } = await confirm({
      title: t("admin.confirm_delete_testimonial"),
      body: testimonial.author_name ?? undefined,
      confirmLabel: t("admin.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const supabase = createClient();
      must(await supabase.from("testimonials").delete().eq("id", testimonial.id));
      toast.success(t("admin.toast.deleted"));
      void reload();
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <div>
      <h1 className="font-serif text-2xl text-charcoal">{t("admin.testimonials")}</h1>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      ) : loadError ? (
        <p role="alert" className="mt-8 text-error">{t(adminErrorKey(loadError))}</p>
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
                        className="h-12 rounded-xl border border-sage/30 bg-white/60 px-3 text-charcoal"
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
                    onClick={() => handleDelete(testimonial)}
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
