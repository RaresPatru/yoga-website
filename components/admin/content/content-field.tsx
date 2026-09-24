"use client";

import NextImage from "next/image";
import { ImageIcon } from "lucide-react";
import { useId } from "react";
import type { FieldDef, SiteContentKey } from "@/lib/site-content-schema";
import { socialUrl } from "@/lib/social";
import { toPlainText } from "@/lib/plain-text";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/admin/ui/segmented";
import { CompactEditor } from "@/components/admin/compact-editor";
import { useAdminLocale } from "@/components/admin/locale-provider";

/** A field's two values while she edits. Fields with one value use `ro`. */
export interface FieldValue {
  ro: string;
  en: string;
}

const INPUT =
  "w-full rounded-xl border border-sage/30 bg-white px-4 py-3 text-base text-charcoal placeholder:text-charcoal-light/60 focus:border-rose-deep/60";

/**
 * One site-content field, drawn from its entry in lib/site-content-schema.ts.
 *
 * `mode` is the form's RO / EN switch. In EN mode a translatable field edits
 * its English value and shows the Romanian one above it for reference; a field
 * with one value for both languages says so and stays editable, since
 * changing it changes both.
 *
 * Under every field a hint says what the site shows while it is empty: the
 * Romanian text (for English), a plain label, a dashed placeholder, or
 * nothing. That is the question she would otherwise have to answer by
 * visiting the site.
 */
export function ContentField({
  fieldKey,
  def,
  value,
  mode,
  onChange,
  onPickImage,
}: {
  fieldKey: SiteContentKey;
  def: FieldDef;
  value: FieldValue;
  mode: "ro" | "en";
  onChange: (lang: "ro" | "en", next: string) => void;
  onPickImage: () => void;
}) {
  const { t, locale } = useAdminLocale();
  const ui = locale === "en" ? "en" : "ro";
  const id = useId();
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const hintId = `${id}-hint`;

  const editingEnglish = mode === "en" && def.translatable;
  const lang: "ro" | "en" = editingEnglish ? "en" : "ro";
  const current = editingEnglish ? value.en : value.ro;
  const set = (next: string) => onChange(lang, next);

  /** What a visitor sees while this field is empty, in the language being edited. */
  const hint = (() => {
    // A choice always has one option selected.
    if (current.trim() || def.kind === "choice") return null;
    if (editingEnglish && value.ro.trim()) return t("admin.cms.empty_uses_romanian");
    if (def.fallback) {
      return t("admin.cms.empty_shows").replace("{text}", def.fallback[lang]);
    }
    if (def.placeholder) {
      return t("admin.cms.empty_placeholder").replace("{name}", def.placeholder[lang]);
    }
    return t("admin.cms.empty_hidden");
  })();

  const describedBy = [def.help ? helpId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  const reference =
    editingEnglish && value.ro.trim() ? (
      <p className="rounded-lg bg-sage/10 px-3 py-2 text-sm text-charcoal-light" lang="ro">
        <span className="font-medium text-charcoal">{t("admin.cms.romanian")}: </span>
        {def.kind === "richtext" ? toPlainText(value.ro) : value.ro}
      </p>
    ) : null;

  const control = (() => {
    switch (def.kind) {
      case "image":
        return (
          <div className="flex items-center gap-4">
            {value.ro ? (
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-sage/10">
                <NextImage src={value.ro} alt="" fill sizes="96px" className="object-cover" />
              </div>
            ) : (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-sage/40">
                <ImageIcon className="h-6 w-6 text-sage-deep/60" aria-hidden="true" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onPickImage} aria-describedby={describedBy}>
                {value.ro ? t("admin.cms.change_image") : t("admin.cms.choose_image")}
              </Button>
              {value.ro && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange("ro", "")}>
                  {t("admin.cms.remove_image")}
                </Button>
              )}
            </div>
          </div>
        );
      case "choice":
        return (
          <Segmented
            legend={def.label[ui]}
            hideLegend
            value={value.ro || def.defaultChoice || ""}
            options={(def.choices ?? []).map((choice) => ({ value: choice.value, label: choice.label[ui] }))}
            onChange={(next) => onChange("ro", next)}
          />
        );
      case "richtext":
        return (
          <CompactEditor
            key={lang}
            value={current}
            onChange={set}
            labelId={labelId}
            describedBy={describedBy}
            lang={lang}
          />
        );
      case "textarea":
        return (
          <textarea
            id={id}
            value={current}
            onChange={(e) => set(e.target.value)}
            rows={3}
            maxLength={def.maxLength}
            lang={lang === "ro" ? "ro-RO" : "en"}
            aria-describedby={describedBy}
            className={INPUT}
          />
        );
      default:
        return (
          <input
            id={id}
            type="text"
            value={current}
            onChange={(e) => set(e.target.value)}
            maxLength={def.maxLength}
            inputMode={def.kind === "social" ? "url" : undefined}
            autoComplete="off"
            lang={def.kind === "social" ? undefined : lang === "ro" ? "ro-RO" : "en"}
            aria-describedby={describedBy}
            className={INPUT}
          />
        );
    }
  })();

  // A choice is its own fieldset with a legend; everything else gets a label.
  const isChoice = def.kind === "choice";
  const socialLink = def.kind === "social" && def.network ? socialUrl(value.ro, def.network) : null;

  return (
    <div className="space-y-2" data-field={fieldKey}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        {isChoice ? (
          <p id={labelId} className="text-sm font-medium text-charcoal" aria-hidden="true">
            {def.label[ui]}
          </p>
        ) : (
          <label id={labelId} htmlFor={def.kind === "richtext" || def.kind === "image" ? undefined : id} className="text-sm font-medium text-charcoal">
            {def.label[ui]}
          </label>
        )}
        {mode === "en" && !def.translatable && (
          <span className="text-xs text-charcoal-light">{t("admin.cms.same_both")}</span>
        )}
      </div>
      {def.help && (
        <p id={helpId} className="text-sm text-charcoal-light">
          {def.help[ui]}
        </p>
      )}
      {reference}
      {control}
      {def.maxLength && (def.kind === "text" || def.kind === "textarea") && (
        <p className="text-right text-xs text-charcoal-light">
          {current.length}/{def.maxLength}
        </p>
      )}
      {socialLink && (
        <p className="break-all text-sm text-charcoal-light">
          {t("admin.cms.links_to")}{" "}
          <a href={socialLink} target="_blank" rel="noopener noreferrer" className="text-rose-deep underline underline-offset-2">
            {socialLink}
          </a>
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-sm italic text-charcoal-light">
          {hint}
        </p>
      )}
    </div>
  );
}
