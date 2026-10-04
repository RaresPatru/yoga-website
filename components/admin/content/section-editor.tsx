"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { adminErrorKey, must, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { translateHtml, translateTexts } from "@/lib/admin/translate";
import {
  FIELDS,
  LEGAL_DOCUMENT_HELP,
  sectionOf,
  storedFieldType,
  type ContentSection,
  type FieldDef,
  type SiteContentKey,
} from "@/lib/site-content-schema";
import { MediaLibrary } from "@/components/admin/media-library";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useToast } from "@/components/admin/ui/toaster";
import { ContentField, type FieldValue } from "./content-field";
import { FormBar } from "./form-bar";

type Values = Record<string, FieldValue>;

const EMPTY: FieldValue = { ro: "", en: "" };

function same(a: FieldValue, b: FieldValue): boolean {
  return a.ro === b.ro && a.en === b.en;
}

/**
 * One section of "Conținut site" as a single form with one Save.
 *
 * Every field of the section is loaded at once and edited in place; nothing
 * reaches the database until Save, which writes only the fields that changed.
 * A field whose row does not exist yet (a key added to the schema after the
 * site went live) is created by that same save, with its section, label and
 * type taken from lib/site-content-schema.ts.
 */
export function SectionEditor({
  section,
  onDirtyChange,
}: {
  section: ContentSection;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t, locale } = useAdminLocale();
  const ui = locale === "en" ? "en" : "ro";
  const toast = useToast();
  const keys = useMemo(() => section.groups.flatMap((g) => g.keys), [section]);

  const [mode, setMode] = useState<"ro" | "en">("ro");
  const [draft, setDraft] = useState<Values>({});
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [imageFor, setImageFor] = useState<SiteContentKey | null>(null);

  const { data: saved, setData: setSaved, loading, error } = useAdminData(async () => {
    const supabase = createClient();
    const rows = must(
      await supabase.from("site_content").select("key, value_ro, value_en").in("key", keys)
    );
    const values: Values = {};
    for (const key of keys) values[key] = { ...EMPTY };
    for (const row of rows ?? []) values[row.key] = { ro: row.value_ro ?? "", en: row.value_en ?? "" };
    return values;
  }, section.id);

  // A fresh load (or another section) replaces whatever was being edited.
  // Keyed on the loaded object itself, so it runs once per load.
  const [loadedFrom, setLoadedFrom] = useState<Values | undefined>(undefined);
  if (saved && saved !== loadedFrom) {
    setLoadedFrom(saved);
    setDraft(saved);
  }

  const changed = keys.filter((key) => saved && draft[key] && !same(draft[key], saved[key]));
  const dirty = changed.length > 0;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const translatable = keys.filter((key) => (FIELDS[key] as FieldDef).translatable);
  const withRomanian = translatable.filter((key) => draft[key]?.ro.trim());
  const english = {
    filled: withRomanian.filter((key) => draft[key]?.en.trim()).length,
    total: withRomanian.length,
  };
  const missingEnglish = withRomanian.filter((key) => !draft[key]?.en.trim());

  const update = (key: SiteContentKey, lang: "ro" | "en", next: string) =>
    setDraft((prev) => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY), [lang]: next } }));

  /** Fills every empty English field from its Romanian text. Filled ones are left alone. */
  const translateMissing = async () => {
    setTranslating(true);
    try {
      const plain = missingEnglish.filter((key) => (FIELDS[key] as FieldDef).kind !== "richtext");
      const rich = missingEnglish.filter((key) => (FIELDS[key] as FieldDef).kind === "richtext");
      const texts = await translateTexts(plain.map((key) => draft[key].ro));
      const html = await Promise.all(rich.map((key) => translateHtml(draft[key].ro)));
      setDraft((prev) => {
        const next = { ...prev };
        plain.forEach((key, i) => (next[key] = { ...next[key], en: texts[i] }));
        rich.forEach((key, i) => (next[key] = { ...next[key], en: html[i] }));
        return next;
      });
      toast.info(
        t("admin.cms.translated").replace("{count}", String(plain.length + rich.length))
      );
    } catch {
      toast.error(t("admin.translate_error"));
    } finally {
      setTranslating(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const rows = changed.map((key) => {
        const def = FIELDS[key] as FieldDef;
        const { id, order } = sectionOf(key);
        const value = draft[key];
        return {
          key,
          section: id,
          sort_order: order,
          field_type: storedFieldType(def.kind),
          label_ro: def.label.ro,
          value_ro: value.ro,
          // One value for both languages lives in value_ro alone.
          value_en: def.translatable && value.en.trim() ? value.en : null,
        };
      });
      must(await createClient().from("site_content").upsert(rows, { onConflict: "key" }));
      setSaved((prev) => ({ ...(prev ?? {}), ...Object.fromEntries(changed.map((key) => [key, draft[key]])) }));
      setLoadedFrom(undefined);
      toast.success(t("admin.toast.saved"));
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <p role="alert" className="text-error">
        {t(adminErrorKey(error))}
      </p>
    );
  }
  if (loading || !saved) {
    return <p className="text-charcoal-light">{t("admin.loading")}</p>;
  }

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
        canTranslate={missingEnglish.length > 0}
        bilingual={translatable.length > 0}
      />

      <div className="space-y-8">
        {section.groups.map((group, index) => (
          <fieldset
            key={group.title?.ro ?? index}
            className="space-y-6 rounded-2xl border border-sage/25 bg-warm-white p-5 sm:p-6"
          >
            {group.title && (
              <legend className="float-left mb-2 w-full font-serif text-lg text-charcoal">
                {group.title[ui]}
              </legend>
            )}
            {group.keys.some((key) => key.startsWith("legal.") && (FIELDS[key] as FieldDef).kind === "richtext") && (
              <p className="clear-both text-sm text-charcoal-light">{LEGAL_DOCUMENT_HELP[ui]}</p>
            )}
            {group.keys.map((key) => (
              <div key={key} className="clear-both">
                <ContentField
                  fieldKey={key}
                  def={FIELDS[key] as FieldDef}
                  value={draft[key] ?? EMPTY}
                  mode={mode}
                  onChange={(lang, next) => update(key, lang, next)}
                  onPickImage={() => setImageFor(key)}
                />
              </div>
            ))}
          </fieldset>
        ))}
      </div>

      <MediaLibrary
        open={imageFor !== null}
        onClose={() => setImageFor(null)}
        filterType="image"
        onSelect={(url) => {
          if (imageFor) update(imageFor, "ro", url);
          setImageFor(null);
        }}
      />
    </form>
  );
}
