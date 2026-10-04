"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminErrorKey, must, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { translateTexts } from "@/lib/admin/translate";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { useToast } from "@/components/admin/ui/toaster";
import { FormBar } from "./form-bar";

interface Faq {
  /** Missing until the question is first saved. */
  id?: string;
  /** Stable while editing, including for unsaved questions. */
  localId: string;
  question_ro: string;
  question_en: string;
  answer_ro: string;
  answer_en: string;
  published: boolean;
}

const INPUT =
  "w-full rounded-xl border border-sage/30 bg-white px-4 py-3 text-base text-charcoal focus:border-rose-deep/60";

function serialise(faqs: Faq[]): string {
  return JSON.stringify(
    faqs.map(({ id, question_ro, question_en, answer_ro, answer_en, published }) => ({
      id,
      question_ro,
      question_en,
      answer_ro,
      answer_en,
      published,
    }))
  );
}

/**
 * The home page's questions, as one form with one Save.
 *
 * - "Adaugă o întrebare" adds a hidden question (audit B14): it reaches the
 *   site only when she ticks "Publicată" and saves.
 * - The order is the list's order. She drags a question by its handle, or
 *   uses the up and down buttons, which also work from the keyboard and on a
 *   phone, where dragging is awkward.
 * - The RO / EN switch flips every question and answer at once, like the
 *   other sections.
 * - Deleting asks first. A question that was never saved simply disappears.
 */
export function FaqEditor({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { t } = useAdminLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const [mode, setMode] = useState<"ro" | "en">("ro");
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  const { data, loading, error, reload } = useAdminData(async () => {
    const rows = must(
      await createClient().from("faqs").select("*").order("sort_order").order("created_at")
    );
    return (rows ?? []).map<Faq>((row) => ({
      id: row.id,
      localId: row.id,
      question_ro: row.question_ro,
      question_en: row.question_en ?? "",
      answer_ro: row.answer_ro,
      answer_en: row.answer_en ?? "",
      published: row.published,
    }));
  });

  const [loadedFrom, setLoadedFrom] = useState<Faq[] | undefined>(undefined);
  if (data && data !== loadedFrom) {
    setLoadedFrom(data);
    setFaqs(data);
    setBaseline(serialise(data));
  }

  const dirty = serialise(faqs) !== baseline;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const patch = (localId: string, change: Partial<Faq>) =>
    setFaqs((prev) => prev.map((faq) => (faq.localId === localId ? { ...faq, ...change } : faq)));

  const move = (from: number, to: number) =>
    setFaqs((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  const add = () =>
    setFaqs((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        question_ro: "",
        question_en: "",
        answer_ro: "",
        answer_en: "",
        published: false,
      },
    ]);

  const remove = async (faq: Faq) => {
    const { confirmed } = await confirm({
      title: t("admin.faq.delete_title"),
      body: faq.question_ro || t("admin.faq.untitled"),
      confirmLabel: t("admin.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    if (faq.id) {
      try {
        must(await createClient().from("faqs").delete().eq("id", faq.id));
      } catch (failure) {
        toast.error(t(adminErrorKey(toAdminError(failure))));
        return;
      }
      toast.success(t("admin.toast.deleted"));
      // Deleted in the database at once, so the saved state loses it too.
      setBaseline((prev) =>
        JSON.stringify((JSON.parse(prev) as Array<{ id?: string }>).filter((row) => row.id !== faq.id))
      );
    }
    setFaqs((prev) => prev.filter((item) => item.localId !== faq.localId));
  };

  const withRomanian = faqs.flatMap((faq) => [
    faq.question_ro.trim() ? (faq.question_en.trim() ? 1 : 0) : null,
    faq.answer_ro.trim() ? (faq.answer_en.trim() ? 1 : 0) : null,
  ]).filter((x): x is 0 | 1 => x !== null);
  const english = { filled: withRomanian.filter((x) => x === 1).length, total: withRomanian.length };

  const translateMissing = async () => {
    setTranslating(true);
    try {
      const jobs: Array<{ localId: string; field: "question_en" | "answer_en"; text: string }> = [];
      for (const faq of faqs) {
        if (faq.question_ro.trim() && !faq.question_en.trim())
          jobs.push({ localId: faq.localId, field: "question_en", text: faq.question_ro });
        if (faq.answer_ro.trim() && !faq.answer_en.trim())
          jobs.push({ localId: faq.localId, field: "answer_en", text: faq.answer_ro });
      }
      const out = await translateTexts(jobs.map((job) => job.text));
      setFaqs((prev) =>
        prev.map((faq) => {
          const next = { ...faq };
          jobs.forEach((job, i) => {
            if (job.localId === faq.localId) next[job.field] = out[i];
          });
          return next;
        })
      );
      toast.info(t("admin.cms.translated").replace("{count}", String(jobs.length)));
    } catch {
      toast.error(t("admin.translate_error"));
    } finally {
      setTranslating(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || saving) return;
    if (faqs.some((faq) => !faq.question_ro.trim())) {
      toast.error(t("admin.faq.question_required"));
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const rows = faqs.map((faq, index) => ({
        question_ro: faq.question_ro.trim(),
        question_en: faq.question_en.trim() || null,
        answer_ro: faq.answer_ro,
        answer_en: faq.answer_en.trim() || null,
        published: faq.published,
        sort_order: (index + 1) * 10,
      }));
      const existing = faqs.flatMap((faq, index) => (faq.id ? [{ ...rows[index], id: faq.id }] : []));
      const fresh = faqs.flatMap((faq, index) => (faq.id ? [] : [rows[index]]));
      if (existing.length) must(await supabase.from("faqs").upsert(existing, { onConflict: "id" }));
      if (fresh.length) must(await supabase.from("faqs").insert(fresh));
      toast.success(t("admin.toast.saved"));
      reload();
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <p role="alert" className="text-error">{t(adminErrorKey(error))}</p>;
  if (loading && !data) return <p className="text-charcoal-light">{t("admin.loading")}</p>;

  const lang = mode;

  return (
    <form onSubmit={save} noValidate>
      <FormBar
        mode={mode}
        onMode={setMode}
        english={english}
        dirty={dirty}
        saving={saving}
        translating={translating}
        onTranslate={translateMissing}
        canTranslate={english.filled < english.total}
      />

      {faqs.length === 0 ? (
        <p className="mb-6 text-charcoal-light">{t("admin.faq.none")}</p>
      ) : (
        <ol className="space-y-4">
          {faqs.map((faq, index) => {
            const number = index + 1;
            const qId = `faq-${faq.localId}-q`;
            const aId = `faq-${faq.localId}-a`;
            return (
              <li
                key={faq.localId}
                onDragOver={(event) => {
                  if (dragging === null) return;
                  event.preventDefault();
                  const from = faqs.findIndex((item) => item.localId === dragging);
                  if (from !== index) move(from, index);
                }}
                onDrop={(event) => event.preventDefault()}
                className={cn(
                  "rounded-2xl border border-sage/25 bg-warm-white p-4 sm:p-5",
                  dragging === faq.localId && "opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex shrink-0 flex-col items-center gap-1 pt-7">
                    <span
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        setDragging(faq.localId);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className="hidden cursor-grab rounded-lg p-2 text-charcoal-light hover:bg-sage/15 sm:block"
                      title={t("admin.faq.drag")}
                      aria-hidden="true"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <button
                      type="button"
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      aria-label={t("admin.faq.move_up").replace("{n}", String(number))}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-charcoal-light hover:bg-sage/15 disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, index + 1)}
                      disabled={index === faqs.length - 1}
                      aria-label={t("admin.faq.move_down").replace("{n}", String(number))}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-charcoal-light hover:bg-sage/15 disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1.5">
                      <label htmlFor={qId} className="text-sm font-medium text-charcoal">
                        {t("admin.faq.question").replace("{n}", String(number))}
                      </label>
                      {lang === "en" && faq.question_ro && (
                        <p className="rounded-lg bg-sage/10 px-3 py-2 text-sm text-charcoal-light" lang="ro">
                          <span className="font-medium text-charcoal">{t("admin.cms.romanian")}: </span>
                          {faq.question_ro}
                        </p>
                      )}
                      <input
                        id={qId}
                        type="text"
                        value={lang === "ro" ? faq.question_ro : faq.question_en}
                        onChange={(e) =>
                          patch(faq.localId, lang === "ro" ? { question_ro: e.target.value } : { question_en: e.target.value })
                        }
                        lang={lang === "ro" ? "ro-RO" : "en"}
                        className={INPUT}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor={aId} className="text-sm font-medium text-charcoal">
                        {t("admin.faq.answer")}
                      </label>
                      {lang === "en" && faq.answer_ro && (
                        <p className="whitespace-pre-line rounded-lg bg-sage/10 px-3 py-2 text-sm text-charcoal-light" lang="ro">
                          <span className="font-medium text-charcoal">{t("admin.cms.romanian")}: </span>
                          {faq.answer_ro}
                        </p>
                      )}
                      <textarea
                        id={aId}
                        rows={3}
                        value={lang === "ro" ? faq.answer_ro : faq.answer_en}
                        onChange={(e) =>
                          patch(faq.localId, lang === "ro" ? { answer_ro: e.target.value } : { answer_en: e.target.value })
                        }
                        lang={lang === "ro" ? "ro-RO" : "en"}
                        className={INPUT}
                      />
                      {lang === "en" && faq.answer_ro && !faq.answer_en.trim() && (
                        <p className="text-sm italic text-charcoal-light">{t("admin.cms.empty_uses_romanian")}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-charcoal">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={faq.published}
                          onChange={(e) => patch(faq.localId, { published: e.target.checked })}
                          className="h-5 w-5 accent-rose-deep"
                        />
                        {t("admin.faq.published")}
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(faq)}
                        aria-label={t("admin.faq.delete").replace("{n}", String(number))}
                      >
                        <Trash2 className="h-4 w-4 text-error" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Button type="button" variant="secondary" size="sm" onClick={add} className="mt-4">
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t("admin.faq.add")}
      </Button>
    </form>
  );
}
