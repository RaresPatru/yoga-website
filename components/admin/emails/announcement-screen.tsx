"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, RotateCw, Send, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ANNOUNCEMENT_VARIABLES, type EmailLocale } from "@/lib/email-content";
import { emailBodyExtensions, fromEditorHtml, toEditorHtml } from "@/lib/email-editor";
import { cardEventsFor, eventCardIds, loadCardEvents, previewEmail, type CardEventRow } from "@/lib/email-preview";
import { parseAudience, type Audience, type AudiencePerson } from "@/lib/announcement-audience";
import type { EmailSettings } from "@/lib/email-brand";
import { adminErrorKey, toAdminError } from "@/lib/admin/db";
import { countSentence } from "@/lib/admin/plural";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useLeaveGuard } from "@/lib/admin/use-leave-guard";
import { translateHtml, translateTexts } from "@/lib/admin/translate";
import { eventChoices } from "@/lib/admin/participants";
import {
  EmailRequestError,
  announcementRecipients,
  deleteAnnouncement,
  eventsForCards,
  loadAnnouncement,
  loadPreviewContext,
  previewAudience,
  saveAnnouncementTexts,
  sendAnnouncementNow,
  sendTest,
  setAnnouncementAudience,
  textsOf,
  type AnnouncementListRow,
  type EmailTexts,
  type RecipientRow,
} from "@/lib/admin/emails";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Flag } from "@/components/ui/flag";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { useToast } from "@/components/admin/ui/toaster";
import { MenuButton } from "@/components/admin/ui/menu-button";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Segmented } from "@/components/admin/ui/segmented";
import { FormBar } from "@/components/admin/content/form-bar";
import { eventDay, longMoment } from "@/components/admin/participants/status-chip";
import { EmailFields, type CardOption } from "./email-fields";
import { EmailPreviewPanel } from "./email-preview-panel";
import { hasWords, sameTexts, testErrorKey } from "./shared";

/**
 * One announcement, at /admin/emails/announcements/<id>.
 *
 * While it is a draft: who it will reach, its subject and text in each
 * language (with her name as the one placeholder, and events as cards), a
 * live preview, a test to herself, and Send. Saved when she presses Save,
 * and before anything that leaves or sends.
 *
 * Once sent: what went, to whom, who was left out and why, with a way to try
 * again the ones that failed.
 */
export function AnnouncementScreen({ id }: { id: string }) {
  const { t } = useAdminLocale();
  useDocumentTitle(`${t("admin.announce.title")} · ${t("admin.emails")}`);
  const { data, loading, error, reload } = useAdminData(async () => {
    const [row, context, events] = await Promise.all([loadAnnouncement(id), loadPreviewContext(), eventsForCards()]);
    return { row, context, events };
  }, id);

  return (
    <div className="pb-24">
      <Link
        href="/admin/emails?tab=announcements"
        className="mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-full pr-3 text-sm text-charcoal-light hover:text-charcoal"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("admin.announce.back")}
      </Link>
      {error ? (
        <p role="alert" className="text-error">
          {t(adminErrorKey(error))}
        </p>
      ) : loading || !data ? (
        <p className="text-charcoal-light">{t("admin.loading")}</p>
      ) : !data.row ? (
        <p className="text-charcoal-light">{t("admin.announce.not_found")}</p>
      ) : data.row.status === "draft" ? (
        <AnnouncementEditor key={data.row.id} row={data.row} settings={data.context.settings} upcoming={data.events} onSent={reload} />
      ) : (
        <AnnouncementReport row={data.row} settings={data.context.settings} onChanged={reload} />
      )}
    </div>
  );
}

/** Cards for every event in the texts, and the ones she may add: upcoming, plus any already in it. */
function useCards(upcoming: CardEventRow[], bodies: string[]) {
  const referenced = eventCardIds(...bodies);
  const missing = referenced.filter((eventId) => !upcoming.some((e) => e.id === eventId));
  const { data: extra = [] } = useAdminData(() => loadCardEvents(createClient(), missing), missing.join(","));
  return useMemo(() => [...upcoming, ...extra.filter((e) => !upcoming.some((u) => u.id === e.id))], [upcoming, extra]);
}

function AnnouncementEditor({
  row,
  settings,
  upcoming,
  onSent,
}: {
  row: AnnouncementListRow;
  settings: EmailSettings;
  upcoming: CardEventRow[];
  onSent: () => void;
}) {
  const { t, locale } = useAdminLocale();
  const ui: EmailLocale = locale === "en" ? "en" : "ro";
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const id = row.id!;

  const [saved, setSaved] = useState<EmailTexts>(() =>
    textsOf({ subject_ro: row.subject_ro ?? "", subject_en: row.subject_en, body_ro: row.body_ro ?? "", body_en: row.body_en })
  );
  const [draft, setDraft] = useState<EmailTexts>(saved);
  const [mode, setMode] = useState<EmailLocale>("ro");
  const [audience, setAudience] = useState<Audience>(() => parseAudience(row.audience));
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [tried, setTried] = useState(false);

  const dirty = !sameTexts(draft, saved);
  const confirmLeave = useCallback(async () => {
    const { confirmed } = await confirm({
      title: t("admin.cms.leave_title"),
      body: t("admin.announce.leave_body"),
      confirmLabel: t("admin.cms.leave_confirm"),
      cancelLabel: t("admin.cms.leave_cancel"),
      tone: "danger",
    });
    return confirmed;
  }, [confirm, t]);
  useLeaveGuard(dirty && !sending, confirmLeave);

  const {
    data: people,
    loading: peopleLoading,
    error: peopleError,
  } = useAdminData(() => previewAudience(audience), JSON.stringify(audience));
  const included = (people ?? []).filter((person) => person.included);

  const cardRows = useCards(upcoming, [draft.body_ro, draft.body_en]);
  const cardOptions: CardOption[] = cardRows.map((event) => ({
    id: event.id,
    title: (ui === "en" && event.title_en?.trim()) || event.title_ro,
    when: eventDay(event.date, ui),
  }));
  const pickable = cardOptions.filter((option) => upcoming.some((event) => event.id === option.id));

  const subjectMissing = !draft.subject_ro.trim();
  const bodyMissing = !hasWords(draft.body_ro);

  const effective = (lang: EmailLocale) => ({
    subject: (lang === "en" && draft.subject_en.trim()) || draft.subject_ro,
    body: (lang === "en" && hasWords(draft.body_en) && draft.body_en) || draft.body_ro,
  });
  const shown = effective(mode);
  const sampleName = (included.find((person) => person.locale === mode) ?? included[0])?.fullName;
  const cards = useMemo(() => cardEventsFor(cardRows, mode, settings.brand.siteUrl), [cardRows, mode, settings]);
  const preview = useMemo(
    () =>
      previewEmail({
        kind: "announcement",
        locale: mode,
        subject: shown.subject || t("admin.announce.untitled"),
        body: shown.body,
        settings,
        cards,
        name: sampleName,
      }),
    [mode, shown.subject, shown.body, settings, cards, sampleName, t]
  );

  const set = (field: keyof EmailTexts) => (value: string) => setDraft((prev) => ({ ...prev, [field]: value }));

  /** Writes the texts if they changed. False when the save failed, having said why. */
  const persist = async (): Promise<boolean> => {
    if (!dirty) return true;
    setSaving(true);
    try {
      await saveAnnouncementTexts(id, draft);
      setSaved(draft);
      return true;
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (await persist()) toast.success(t("admin.announce.saved"));
  };

  const translateMissing = async () => {
    setTranslating(true);
    try {
      const next = { ...draft };
      if (!next.subject_en.trim() && next.subject_ro.trim()) [next.subject_en] = await translateTexts([next.subject_ro]);
      if (!hasWords(next.body_en) && hasWords(next.body_ro)) {
        const extensions = emailBodyExtensions({ label: (name) => name, describeEvent: () => null });
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

  const test = async () => {
    if (!shown.subject.trim() || !hasWords(shown.body)) {
      setTried(true);
      toast.error(t("admin.mail.missing_ro"));
      return;
    }
    setTesting(true);
    try {
      const to = await sendTest({ kind: "announcement", locale: mode, subject: shown.subject, body: shown.body, name: sampleName });
      toast.success(t("admin.mail.test_sent").replace("{email}", to));
    } catch (failure) {
      toast.error(t(failure instanceof EmailRequestError ? testErrorKey(failure.code) : adminErrorKey(toAdminError(failure))));
    } finally {
      setTesting(false);
    }
  };

  const chooseAll = async () => {
    try {
      await setAnnouncementAudience(id, { kind: "all" });
      setAudience({ kind: "all" });
      toast.success(t("admin.announce.audience_saved"));
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    }
  };

  const chooseFromRegistrations = async () => {
    if (await persist()) router.push(`/admin/registrations?announcement=${id}`);
  };

  const send = async () => {
    setTried(true);
    if (subjectMissing || bodyMissing) {
      setMode("ro");
      toast.error(t("admin.mail.missing_ro"));
      return;
    }
    if (!included.length) {
      toast.error(t("admin.announce.error_nobody"));
      return;
    }
    if (!(await persist())) return;
    const ro = included.filter((person) => person.locale === "ro").length;
    const { confirmed } = await confirm({
      title: t("admin.announce.send_title"),
      body: t("admin.announce.send_body")
        .replace("{count}", String(included.length))
        .replace("{ro}", String(ro))
        .replace("{en}", String(included.length - ro)),
      confirmLabel: t("admin.announce.send_confirm"),
    });
    if (!confirmed) return;
    setSending(true);
    try {
      const report = await sendAnnouncementNow(id);
      toast.success(
        report.failed > 0 ? t("admin.announce.sent_partly") : countSentence(t, ui, "admin.announce.sent_done", report.sent)
      );
      onSent();
    } catch (failure) {
      if (failure instanceof EmailRequestError) {
        toast.error(t(`admin.announce.error_${["empty", "nobody", "busy", "already_sent"].includes(failure.code) ? failure.code : "failed"}`));
        if (failure.code === "already_sent") onSent();
      } else {
        toast.error(t(adminErrorKey(toAdminError(failure))));
      }
      setSending(false);
    }
  };

  const remove = async () => {
    const { confirmed } = await confirm({
      title: t("admin.announce.delete_title"),
      body: t("admin.announce.delete_body"),
      confirmLabel: t("admin.announce.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await deleteAnnouncement(id);
      setSaved(draft); // nothing left to save
      toast.success(t("admin.announce.deleted"));
      router.push("/admin/emails?tab=announcements");
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    }
  };

  const english = {
    filled: [draft.subject_en.trim() !== "", hasWords(draft.body_en)].filter(Boolean).length,
    total: 2,
  };

  return (
    <>
      <PageHeader title={t("admin.announce.title")} description={t("admin.announce.draft_note")} />
      <AudienceCard
        audience={audience}
        people={people}
        loading={peopleLoading}
        failed={Boolean(peopleError)}
        onAll={chooseAll}
        onChoose={chooseFromRegistrations}
      />
      <form onSubmit={save} noValidate className="mt-8">
        <FormBar
          mode={mode}
          onMode={setMode}
          english={english}
          dirty={dirty}
          saving={saving}
          translating={translating}
          onTranslate={translateMissing}
          canTranslate={(!draft.subject_en.trim() && !!draft.subject_ro.trim()) || (!hasWords(draft.body_en) && hasWords(draft.body_ro))}
          saveLabel={t("admin.announce.save")}
        />
        <div className="grid gap-10 xl:grid-cols-2 xl:gap-8">
          <EmailFields
            lang={mode}
            subject={mode === "en" ? draft.subject_en : draft.subject_ro}
            body={mode === "en" ? draft.body_en : draft.body_ro}
            onSubject={set(mode === "en" ? "subject_en" : "subject_ro")}
            onBody={set(mode === "en" ? "body_en" : "body_ro")}
            romanian={mode === "en" ? { subject: draft.subject_ro, body: draft.body_ro } : undefined}
            variables={ANNOUNCEMENT_VARIABLES}
            cards={pickable.length || cardOptions.length ? cardOptions : []}
            subjectError={tried && mode === "ro" && subjectMissing ? t("admin.mail.subject_required") : null}
            bodyError={tried && mode === "ro" && bodyMissing ? t("admin.mail.body_required") : null}
          />
          <div className="xl:sticky xl:top-[calc(var(--admin-header-h)+5.5rem)] xl:self-start">
            <EmailPreviewPanel
              html={preview.html}
              subject={preview.subject}
              caption={sampleName ? t("admin.announce.preview_for").replace("{name}", sampleName) : undefined}
              onTest={test}
              testing={testing}
            />
          </div>
        </div>
      </form>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-sage/20 pt-6">
        <Button type="button" onClick={send} disabled={sending || saving}>
          <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {sending ? t("admin.announce.sending") : t("admin.announce.send")}
        </Button>
        <p className="text-sm text-charcoal-light">
          {peopleLoading ? t("admin.announce.counting") : countSentence(t, ui, "admin.announce.will_receive", included.length)}
        </p>
        <button
          type="button"
          onClick={remove}
          disabled={sending}
          className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-error hover:bg-error/10 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t("admin.announce.delete")}
        </button>
      </div>
    </>
  );
}

/** Who a draft will reach: the choice in one sentence, the count, and the names. */
function AudienceCard({
  audience,
  people,
  loading,
  failed,
  onAll,
  onChoose,
}: {
  audience: Audience;
  people: AudiencePerson[] | undefined;
  loading: boolean;
  failed: boolean;
  onAll: () => void;
  onChoose: () => void;
}) {
  const { t, locale } = useAdminLocale();
  const ui: "ro" | "en" = locale === "en" ? "en" : "ro";
  const filterEvent = audience.kind === "filter" ? audience.filters.eventId : null;
  const { data: events = [] } = useAdminData(() => (filterEvent ? eventChoices() : Promise.resolve([])), filterEvent ?? "");

  const included = (people ?? []).filter((person) => person.included);
  const excluded = (people ?? []).filter((person) => !person.included);

  const description = (() => {
    if (audience.kind === "all") return t("admin.announce.audience_all");
    if (audience.kind === "ids") return countSentence(t, ui, "admin.announce.audience_ids", audience.ids.length);
    const f = audience.filters;
    const parts = [
      t(`admin.participants.tab_${f.tab}`),
      f.status ? t(`admin.participants.status_${f.status}`) : null,
      f.eventId ? (events.find((e) => e.id === f.eventId)?.title ?? "…") : null,
      f.q ? t("admin.announce.filter_search").replace("{q}", f.q) : null,
    ].filter(Boolean);
    return t("admin.announce.audience_filter").replace("{filter}", parts.join(", "));
  })();

  return (
    <section aria-labelledby="announcement-audience" className="rounded-2xl border border-sage/25 bg-warm-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="announcement-audience" className="flex items-center gap-2 font-serif text-xl text-charcoal">
          <Users className="h-5 w-5 text-sage-deep" aria-hidden="true" />
          {t("admin.announce.recipients")}
        </h2>
        <MenuButton
          label={t("admin.announce.change")}
          align="end"
          triggerClassName="inline-flex h-10 items-center rounded-full border border-sage/30 bg-white px-4 text-sm font-medium text-charcoal hover:bg-sage/10"
          trigger={t("admin.announce.change")}
          items={[
            { id: "all", label: t("admin.announce.choose_all"), checked: audience.kind === "all", onSelect: onAll },
            { id: "registrations", label: t("admin.announce.choose_registrations"), onSelect: onChoose },
          ]}
        />
      </div>
      <p className="mt-2 text-charcoal">{description}</p>
      {failed ? (
        <p role="alert" className="mt-3 text-sm text-error">
          {t("admin.announce.count_failed")}
        </p>
      ) : loading ? (
        <p className="mt-3 text-sm text-charcoal-light">{t("admin.announce.counting")}</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-charcoal" aria-live="polite">
            <strong className="font-medium">{countSentence(t, ui, "admin.announce.will_receive", included.length)}</strong>
            {excluded.length > 0 && <> {countSentence(t, ui, "admin.announce.stay_out", excluded.length)}</>}
          </p>
          {(people ?? []).length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-medium text-rose-deep">{t("admin.announce.show_people")}</summary>
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <PeopleList title={t("admin.announce.included_title")} people={included} />
                {excluded.length > 0 && <PeopleList title={t("admin.announce.excluded_title")} people={excluded} />}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function PeopleList({ title, people }: { title: string; people: AudiencePerson[] }) {
  const { t } = useAdminLocale();
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-medium text-charcoal">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {people.map((person) => (
          <li key={person.email} className="flex min-w-0 items-center gap-2">
            <Flag code={person.locale === "en" ? "GB" : "RO"} />
            <span className="min-w-0 truncate">
              {person.fullName} <span className="text-charcoal-light">{person.email}</span>
            </span>
            {person.reason && (
              <span className="ml-auto shrink-0 rounded-full bg-sage/15 px-2 py-0.5 text-xs text-charcoal-light">
                {t(`admin.announce.reason_${person.reason}`)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Once sent
// ---------------------------------------------------------------------------

const STATUS_ORDER: RecipientRow["status"][] = ["failed", "pending", "sent", "excluded"];

function AnnouncementReport({
  row,
  settings,
  onChanged,
}: {
  row: AnnouncementListRow;
  settings: EmailSettings;
  onChanged: () => void;
}) {
  const { t, locale } = useAdminLocale();
  const ui: EmailLocale = locale === "en" ? "en" : "ro";
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const id = row.id!;
  const [lang, setLang] = useState<EmailLocale>("ro");
  const [working, setWorking] = useState(false);

  const { data: recipients = [], loading } = useAdminData(() => announcementRecipients(id), `${id}|${row.status}|${row.sent_count}`);
  const { data: cardRows = [] } = useAdminData(
    () => loadCardEvents(createClient(), eventCardIds(row.body_ro, row.body_en)),
    id
  );

  const subject = (lang === "en" && row.subject_en?.trim()) || row.subject_ro || "";
  const body = (lang === "en" && row.body_en && hasWords(row.body_en) && row.body_en) || row.body_ro || "";
  const preview = useMemo(
    () =>
      previewEmail({
        kind: "announcement",
        locale: lang,
        subject,
        body,
        settings,
        cards: cardEventsFor(cardRows, lang, settings.brand.siteUrl),
      }),
    [lang, subject, body, settings, cardRows]
  );

  const failed = row.failed_count ?? 0;
  const pending = row.pending_count ?? 0;

  const again = async (retry: boolean) => {
    setWorking(true);
    try {
      const report = await sendAnnouncementNow(id, retry);
      toast.success(
        report.failed > 0 ? t("admin.announce.sent_partly") : countSentence(t, ui, "admin.announce.sent_done", report.sent)
      );
    } catch (failure) {
      if (failure instanceof EmailRequestError) {
        toast.error(t(`admin.announce.error_${["busy", "already_sent"].includes(failure.code) ? failure.code : "failed"}`));
      } else {
        toast.error(t(adminErrorKey(toAdminError(failure))));
      }
    } finally {
      setWorking(false);
      onChanged();
    }
  };

  const remove = async () => {
    const { confirmed } = await confirm({
      title: t("admin.announce.remove_history_title"),
      body: t("admin.announce.remove_history_body"),
      confirmLabel: t("admin.announce.remove_history"),
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await deleteAnnouncement(id);
      toast.success(t("admin.announce.removed_history"));
      router.push("/admin/emails?tab=announcements");
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    }
  };

  const sorted = [...recipients].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.full_name.localeCompare(b.full_name, "ro")
  );

  return (
    <>
      <PageHeader
        title={row.subject_ro?.trim() || t("admin.announce.untitled")}
        description={
          row.status === "sending"
            ? t("admin.announce.sending_state")
            : t("admin.announce.sent_at").replace("{date}", longMoment(row.sent_at ?? "", ui))
        }
      />

      <ul className="space-y-1 text-charcoal">
        <li>{countSentence(t, ui, "admin.announce.reached", row.sent_count ?? 0)}.</li>
        {failed > 0 && <li className="text-error">{countSentence(t, ui, "admin.announce.failed", failed)}.</li>}
        {(row.excluded_count ?? 0) > 0 && <li>{countSentence(t, ui, "admin.announce.left_out", row.excluded_count ?? 0)}.</li>}
        {pending > 0 && <li>{countSentence(t, ui, "admin.announce.not_yet", pending)}.</li>}
      </ul>

      {(row.status === "sending" || (row.status === "sent" && failed > 0)) && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-sage/25 bg-warm-white px-5 py-4">
          <p className="min-w-0 flex-1 text-sm text-charcoal">
            {row.status === "sending" ? t("admin.announce.stuck") : t("admin.announce.some_failed")}
          </p>
          <Button type="button" size="sm" variant="secondary" disabled={working} onClick={() => again(row.status === "sent")}>
            <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {row.status === "sending" ? t("admin.announce.resume") : t("admin.announce.retry_failed")}
          </Button>
        </div>
      )}

      <div className="mt-8 grid gap-10 xl:grid-cols-2 xl:gap-8">
        <section aria-labelledby="announcement-people" className="min-w-0">
          <h2 id="announcement-people" className="font-serif text-xl text-charcoal">
            {t("admin.announce.recipients")}
          </h2>
          {loading ? (
            <p className="mt-3 text-sm text-charcoal-light">{t("admin.loading")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-sage/20 overflow-hidden rounded-2xl border border-sage/25 bg-warm-white text-sm">
              {sorted.map((person) => (
                <li key={person.email} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <Flag code={person.locale === "en" ? "GB" : "RO"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {person.full_name} <span className="text-charcoal-light">{person.email}</span>
                    </span>
                    {person.status === "failed" && person.reason && (
                      <span className="block break-words text-xs text-charcoal-light">{person.reason}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      person.status === "sent" && "bg-success/10 text-success",
                      person.status === "failed" && "bg-error/10 text-error",
                      person.status === "pending" && "bg-warning/10 text-warning",
                      person.status === "excluded" && "bg-sage/15 text-charcoal-light"
                    )}
                  >
                    {person.status === "excluded" && person.reason
                      ? t(`admin.announce.reason_${person.reason}`)
                      : t(`admin.announce.status_${person.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="xl:sticky xl:top-[calc(var(--admin-header-h)+1.5rem)] xl:self-start">
          <EmailPreviewPanel
            html={preview.html}
            subject={preview.subject}
            controls={
              <Segmented
                legend={t("admin.cms.language")}
                hideLegend
                value={lang}
                onChange={setLang}
                options={[
                  { value: "ro", label: "RO" },
                  { value: "en", label: "EN" },
                ]}
              />
            }
          />
        </div>
      </div>

      <div className="mt-10 border-t border-sage/20 pt-6">
        <button
          type="button"
          onClick={remove}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-error hover:bg-error/10"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t("admin.announce.remove_history")}
        </button>
      </div>
    </>
  );
}
