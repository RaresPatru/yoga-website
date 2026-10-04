"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { TEMPLATES, type EmailLocale, type TemplateType } from "@/lib/email-content";
import { emailBodyExtensions, fromEditorHtml, toEditorHtml } from "@/lib/email-editor";
import { previewEmail } from "@/lib/email-preview";
import { adminErrorKey, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useLeaveGuard } from "@/lib/admin/use-leave-guard";
import { translateHtml, translateTexts } from "@/lib/admin/translate";
import {
  EmailRequestError,
  loadPreviewContext,
  loadTemplateRow,
  saveTemplateTexts,
  sendTest,
  textsOf,
  type EmailTexts,
  type SampleEvent,
  type TemplateRow,
} from "@/lib/admin/emails";
import type { EmailSettings } from "@/lib/email-brand";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { useToast } from "@/components/admin/ui/toaster";
import { PageHeader } from "@/components/admin/ui/page-header";
import { FormBar } from "@/components/admin/content/form-bar";
import { EmailFields } from "./email-fields";
import { EmailPreviewPanel } from "./email-preview-panel";
import { hasWords, sameTexts, testErrorKey } from "./shared";

/**
 * One automatic email, at /admin/emails/<type>: its subject and text in each
 * language, with a live preview of the real email and "Trimite-mi un test".
 *
 * Saved only when she presses Save, never on its own: the next email of this
 * kind goes out with whatever is saved, so a half-written sentence must not
 * be. Leaving with changes unsaved asks first.
 */
export function TemplateEditor({ type }: { type: TemplateType }) {
  const { t, locale } = useAdminLocale();
  const ui: EmailLocale = locale === "en" ? "en" : "ro";
  const def = TEMPLATES[type];
  useDocumentTitle(`${def.label[ui]} · ${t("admin.emails")}`);

  const { data, loading, error } = useAdminData(async () => {
    const [row, context] = await Promise.all([loadTemplateRow(type), loadPreviewContext()]);
    return { row, context };
  }, type);

  return (
    <div className="pb-16">
      <Link
        href="/admin/emails"
        className="mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-full pr-3 text-sm text-charcoal-light hover:text-charcoal"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("admin.emails")}
      </Link>
      <PageHeader title={def.label[ui]} description={def.when[ui]} />
      {error ? (
        <p role="alert" className="text-error">
          {t(adminErrorKey(error))}
        </p>
      ) : loading || !data ? (
        <p className="text-charcoal-light">{t("admin.loading")}</p>
      ) : !data.row ? (
        <p role="alert" className="text-error">
          {t("admin.mail.not_found")}
        </p>
      ) : (
        <TemplateForm type={type} row={data.row} settings={data.context.settings} event={data.context.event} />
      )}
    </div>
  );
}

function TemplateForm({
  type,
  row,
  settings,
  event,
}: {
  type: TemplateType;
  row: TemplateRow;
  settings: EmailSettings;
  event: SampleEvent | null;
}) {
  const { t } = useAdminLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const def = TEMPLATES[type];

  const [saved, setSaved] = useState<EmailTexts>(() => textsOf(row));
  const [draft, setDraft] = useState<EmailTexts>(saved);
  const [mode, setMode] = useState<EmailLocale>("ro");
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tried, setTried] = useState(false);

  const dirty = !sameTexts(draft, saved);

  const confirmLeave = useCallback(async () => {
    const { confirmed } = await confirm({
      title: t("admin.cms.leave_title"),
      body: t("admin.mail.leave_body"),
      confirmLabel: t("admin.cms.leave_confirm"),
      cancelLabel: t("admin.cms.leave_cancel"),
      tone: "danger",
    });
    return confirmed;
  }, [confirm, t]);
  useLeaveGuard(dirty, confirmLeave);

  const subjectMissing = !draft.subject_ro.trim();
  const bodyMissing = !hasWords(draft.body_ro);

  /** What goes out in a language: its own text, or the Romanian where it has none. */
  const effective = (lang: EmailLocale) => ({
    subject: (lang === "en" && draft.subject_en.trim()) || draft.subject_ro,
    body: (lang === "en" && hasWords(draft.body_en) && draft.body_en) || draft.body_ro,
  });
  const shown = effective(mode);
  const preview = useMemo(
    () => previewEmail({ kind: "template", type, locale: mode, subject: shown.subject, body: shown.body, settings, event }),
    [type, mode, shown.subject, shown.body, settings, event]
  );

  const english = {
    filled: [draft.subject_en.trim() !== "", hasWords(draft.body_en)].filter(Boolean).length,
    total: 2,
  };

  const set = (field: keyof EmailTexts) => (value: string) => setDraft((prev) => ({ ...prev, [field]: value }));

  const translateMissing = async () => {
    setTranslating(true);
    try {
      const next = { ...draft };
      if (!next.subject_en.trim() && next.subject_ro.trim()) {
        [next.subject_en] = await translateTexts([next.subject_ro]);
      }
      if (!hasWords(next.body_en) && hasWords(next.body_ro)) {
        const extensions = emailBodyExtensions({ label: (name) => name });
        next.body_en = fromEditorHtml(await translateHtml(toEditorHtml(next.body_ro), extensions));
      }
      setDraft(next);
      toast.info(t("admin.mail.translated"));
    } catch {
      toast.error(t("admin.translate_error"));
    } finally {
      setTranslating(false);
    }
  };

  const save = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setTried(true);
    if (subjectMissing || bodyMissing) {
      setMode("ro");
      toast.error(t("admin.mail.missing_ro"));
      return;
    }
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await saveTemplateTexts(type, draft);
      setSaved(draft);
      toast.success(t("admin.toast.saved"));
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const to = await sendTest({ kind: "template", type, locale: mode, subject: shown.subject, body: shown.body });
      toast.success(t("admin.mail.test_sent").replace("{email}", to));
    } catch (failure) {
      toast.error(t(failure instanceof EmailRequestError ? testErrorKey(failure.code) : adminErrorKey(toAdminError(failure))));
    } finally {
      setTesting(false);
    }
  };

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
        canTranslate={(!draft.subject_en.trim() && !!draft.subject_ro.trim()) || (!hasWords(draft.body_en) && hasWords(draft.body_ro))}
      />
      <div className="grid gap-10 xl:grid-cols-2 xl:gap-8">
        <EmailFields
          lang={mode}
          subject={mode === "en" ? draft.subject_en : draft.subject_ro}
          body={mode === "en" ? draft.body_en : draft.body_ro}
          onSubject={set(mode === "en" ? "subject_en" : "subject_ro")}
          onBody={set(mode === "en" ? "body_en" : "body_ro")}
          romanian={mode === "en" ? { subject: draft.subject_ro, body: draft.body_ro } : undefined}
          variables={def.variables}
          subjectError={tried && mode === "ro" && subjectMissing ? t("admin.mail.subject_required") : null}
          bodyError={tried && mode === "ro" && bodyMissing ? t("admin.mail.body_required") : null}
        />
        <div className="xl:sticky xl:top-[calc(var(--admin-header-h)+5.5rem)] xl:self-start">
          <EmailPreviewPanel
            html={preview.html}
            subject={preview.subject}
            caption={
              event ? (
                <>
                  {t("admin.mail.preview_from_event").replace(
                    "{event}",
                    mode === "en" && event.title_en?.trim() ? event.title_en : event.title_ro
                  )}
                  {def.variables.includes("whatsapp_link") && !event.whatsapp_group_link && (
                    <> {t("admin.mail.preview_no_whatsapp")}</>
                  )}
                </>
              ) : (
                t("admin.mail.preview_no_event")
              )
            }
            onTest={test}
            testing={testing}
          />
        </div>
      </div>
    </form>
  );
}
