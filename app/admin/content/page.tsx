"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { MediaLibrary } from "@/components/admin/media-library";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { ImageIcon, Check, Plus, Trash2 } from "lucide-react";
import NextImage from "next/image";

/**
 * Lets the instructor edit the site's page copy and FAQs herself.
 *
 * The point of this screen is that she never needs a developer to change a
 * sentence, swap a photograph, or add a certification. It is driven entirely by
 * whatever rows exist in `site_content`, so adding a new editable field is a
 * one-line database insert rather than a code change and a deploy.
 *
 * `field_type` decides the control: a single-line input, a textarea, or the
 * media library picker for images.
 */

interface ContentRow {
  key: string;
  value_ro: string;
  value_en: string | null;
  section: string;
  sort_order: number;
  field_type: "text" | "richtext" | "image";
  label_ro: string;
}

interface FaqRow {
  id: string;
  question_ro: string;
  question_en: string | null;
  answer_ro: string;
  answer_en: string | null;
  sort_order: number;
  published: boolean;
}

const SECTION_LABELS: Record<string, { ro: string; en: string }> = {
  home: { ro: "Pagina de start", en: "Home page" },
  about: { ro: "Despre mine", en: "About me" },
  general: { ro: "General", en: "General" },
};

export default function AdminContentPage() {
  const { t, locale } = useAdminLocale();
  const ro = locale === "ro";

  const [rows, setRows] = useState<ContentRow[]>([]);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [mediaForKey, setMediaForKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: content }, { data: faqRows }] = await Promise.all([
      supabase.from("site_content").select("*").order("section").order("sort_order"),
      supabase.from("faqs").select("*").order("sort_order"),
    ]);
    setRows((content ?? []) as ContentRow[]);
    setFaqs((faqRows ?? []) as FaqRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.from("site_content").select("*").order("section").order("sort_order"),
      supabase.from("faqs").select("*").order("sort_order"),
    ]).then(([{ data: content }, { data: faqRows }]) => {
      if (cancelled) return;
      setRows((content ?? []) as ContentRow[]);
      setFaqs((faqRows ?? []) as FaqRow[]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateLocal = (key: string, patch: Partial<ContentRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const saveRow = async (row: ContentRow) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("site_content")
      .update({
        value_ro: row.value_ro,
        value_en: row.value_en,
        updated_at: new Date().toISOString(),
      })
      .eq("key", row.key);

    if (error) {
      alert(error.message);
      return;
    }
    // Brief confirmation rather than a toast system: this screen is used by one
    // person, occasionally.
    setSavedKey(row.key);
    window.setTimeout(() => setSavedKey((k) => (k === row.key ? null : k)), 2000);
  };

  const addFaq = async () => {
    const supabase = createClient();
    const { error } = await supabase.from("faqs").insert({
      question_ro: ro ? "Întrebare nouă" : "New question",
      answer_ro: "",
      sort_order: faqs.length * 10,
    });
    if (error) return alert(error.message);
    await load();
  };

  const saveFaq = async (faq: FaqRow) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("faqs")
      .update({
        question_ro: faq.question_ro,
        question_en: faq.question_en,
        answer_ro: faq.answer_ro,
        answer_en: faq.answer_en,
        published: faq.published,
      })
      .eq("id", faq.id);
    if (error) return alert(error.message);
    setSavedKey(faq.id);
    window.setTimeout(() => setSavedKey((k) => (k === faq.id ? null : k)), 2000);
  };

  const deleteFaq = async (id: string) => {
    if (!confirm(ro ? "Ștergi această întrebare?" : "Delete this question?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("faqs").delete().eq("id", id);
    if (error) return alert(error.message);
    setFaqs((prev) => prev.filter((f) => f.id !== id));
  };

  if (loading) {
    return <p className="text-charcoal-light">{t("admin.loading")}</p>;
  }

  const sections = [...new Set(rows.map((r) => r.section))];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl text-charcoal">
          {ro ? "Conținut site" : "Site content"}
        </h1>
        <p className="mt-1 text-sm text-charcoal-light">
          {ro
            ? "Textele și fotografiile de pe site. Câmpurile goale apar ca marcaje pe site până le completezi."
            : "The words and photos on the site. Empty fields show as placeholders until you fill them in."}
        </p>
      </div>

      {sections.map((section) => (
        <GlassCard key={section} hover={false}>
          <h2 className="font-serif text-lg text-charcoal">
            {SECTION_LABELS[section]?.[ro ? "ro" : "en"] ?? section}
          </h2>

          <div className="mt-5 space-y-6">
            {rows
              .filter((r) => r.section === section)
              .map((row) => (
                <div key={row.key} className="border-t border-sage/20 pt-5 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-sm font-medium text-charcoal">
                      {row.label_ro}
                    </label>
                    <span className="font-mono text-xs text-charcoal-light/60">{row.key}</span>
                  </div>

                  {row.field_type === "image" ? (
                    <div className="mt-3 flex items-center gap-4">
                      {row.value_ro ? (
                        <div className="relative h-24 w-24 overflow-hidden rounded-xl bg-sage/10">
                          <NextImage
                            src={row.value_ro}
                            alt=""
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-sage/40">
                          <ImageIcon className="h-6 w-6 text-sage-deep/50" aria-hidden="true" />
                        </div>
                      )}
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setMediaForKey(row.key)}
                        >
                          {ro ? "Alege imagine" : "Choose image"}
                        </Button>
                        {row.value_ro && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              updateLocal(row.key, { value_ro: "" });
                              saveRow({ ...row, value_ro: "" });
                            }}
                          >
                            {ro ? "Elimină" : "Remove"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : row.field_type === "richtext" ? (
                    <>
                      <textarea
                        value={row.value_ro}
                        onChange={(e) => updateLocal(row.key, { value_ro: e.target.value })}
                        rows={5}
                        lang="ro-RO"
                        spellCheck
                        className="mt-3 w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal focus:border-rose-deep/50 focus:outline-none focus:ring-2 focus:ring-rose-deep/20"
                        placeholder={ro ? "Scrie în română..." : "Write in Romanian..."}
                      />
                      <textarea
                        value={row.value_en ?? ""}
                        onChange={(e) => updateLocal(row.key, { value_en: e.target.value })}
                        rows={4}
                        lang="en"
                        spellCheck
                        className="mt-2 w-full rounded-xl border border-sage/20 bg-white/40 px-4 py-3 text-charcoal-light focus:border-rose-deep/50 focus:outline-none focus:ring-2 focus:ring-rose-deep/20"
                        placeholder={
                          ro
                            ? "Engleză (opțional — dacă e gol, se afișează româna)"
                            : "English (optional — falls back to Romanian)"
                        }
                      />
                    </>
                  ) : (
                    <>
                      <Input
                        value={row.value_ro}
                        onChange={(e) => updateLocal(row.key, { value_ro: e.target.value })}
                        className="mt-3"
                      />
                      <Input
                        value={row.value_en ?? ""}
                        onChange={(e) => updateLocal(row.key, { value_en: e.target.value })}
                        className="mt-2"
                        placeholder={ro ? "Engleză (opțional)" : "English (optional)"}
                      />
                    </>
                  )}

                  <div className="mt-3 flex items-center gap-3">
                    <Button size="sm" onClick={() => saveRow(row)}>
                      {t("admin.save")}
                    </Button>
                    {savedKey === row.key && (
                      <span className="flex items-center gap-1 text-sm text-success" role="status">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {ro ? "Salvat" : "Saved"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </GlassCard>
      ))}

      {/* ------------------------------------------------------------------ */}
      {/* FAQs                                                                */}
      {/* ------------------------------------------------------------------ */}
      <GlassCard hover={false}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg text-charcoal">
              {ro ? "Întrebări frecvente" : "Frequently asked questions"}
            </h2>
            <p className="mt-1 text-sm text-charcoal-light">
              {ro
                ? "Răspunde la ce întreabă lumea înainte să se înscrie: ce să aducă, dacă e nevoie de experiență."
                : "Answer what people ask before booking: what to bring, whether experience is needed."}
            </p>
          </div>
          <Button size="sm" onClick={addFaq}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            {ro ? "Adaugă" : "Add"}
          </Button>
        </div>

        <div className="mt-5 space-y-6">
          {faqs.length === 0 && (
            <p className="text-sm text-charcoal-light">
              {ro ? "Nicio întrebare încă." : "No questions yet."}
            </p>
          )}

          {faqs.map((faq) => (
            <div key={faq.id} className="border-t border-sage/20 pt-5 first:border-0 first:pt-0">
              <Input
                value={faq.question_ro}
                onChange={(e) =>
                  setFaqs((prev) =>
                    prev.map((f) => (f.id === faq.id ? { ...f, question_ro: e.target.value } : f))
                  )
                }
                label={ro ? "Întrebare" : "Question"}
              />
              <textarea
                value={faq.answer_ro}
                onChange={(e) =>
                  setFaqs((prev) =>
                    prev.map((f) => (f.id === faq.id ? { ...f, answer_ro: e.target.value } : f))
                  )
                }
                rows={3}
                lang="ro-RO"
                spellCheck
                className="mt-2 w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal focus:border-rose-deep/50 focus:outline-none focus:ring-2 focus:ring-rose-deep/20"
                placeholder={ro ? "Răspuns" : "Answer"}
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={() => saveFaq(faq)}>
                  {t("admin.save")}
                </Button>
                <label className="flex items-center gap-2 text-sm text-charcoal-light">
                  <input
                    type="checkbox"
                    checked={faq.published}
                    onChange={(e) =>
                      setFaqs((prev) =>
                        prev.map((f) =>
                          f.id === faq.id ? { ...f, published: e.target.checked } : f
                        )
                      )
                    }
                  />
                  {ro ? "Vizibil pe site" : "Visible on the site"}
                </label>
                <Button variant="ghost" size="sm" onClick={() => deleteFaq(faq.id)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
                {savedKey === faq.id && (
                  <span className="flex items-center gap-1 text-sm text-success" role="status">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {ro ? "Salvat" : "Saved"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <MediaLibrary
        open={mediaForKey !== null}
        onClose={() => setMediaForKey(null)}
        filterType="image"
        onSelect={(url) => {
          if (!mediaForKey) return;
          const row = rows.find((r) => r.key === mediaForKey);
          if (row) {
            updateLocal(mediaForKey, { value_ro: url });
            saveRow({ ...row, value_ro: url });
          }
          setMediaForKey(null);
        }}
      />
    </div>
  );
}
