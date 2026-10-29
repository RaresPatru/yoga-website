"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, Copy, Pencil, Trash2 } from "lucide-react";
import { adminErrorKey, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { countSentence, pluralForm } from "@/lib/admin/plural";
import {
  CodeError,
  codeRecipients,
  createCode,
  deleteCode,
  editCode,
  listCodes,
  restoreCode,
  setCodeActive,
  type CodeRecipient,
} from "@/lib/admin/promotion-codes";
import {
  changesBetween,
  codeStatus,
  lastDayOf,
  type CodeStatus,
  type NewPromotionCode,
  type PromotionCodeView,
} from "@/lib/promotion-codes";
import { formatPaid } from "@/lib/money";
import { cn, EVENT_TIME_ZONE } from "@/lib/utils";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { useToast } from "@/components/admin/ui/toaster";
import { eventDay, shortDay } from "@/components/admin/participants/status-chip";
import { CodeForm } from "@/components/admin/codes/code-form";
import { CodeDialog } from "@/components/admin/codes/code-dialog";
import { CodeRecipients } from "@/components/admin/codes/code-recipients";

/**
 * Coduri de reducere: the promotion codes she puts in announcements, which
 * people type on Stripe's payment page. Made here so she never needs Stripe's
 * Dashboard for them (Rares, 3 October 2026), and kept in Stripe, which
 * applies them and counts their uses (lib/promotion-codes.ts).
 *
 * A code is a word, a percentage or a fixed amount off, and optionally a last
 * day and a number of uses in all. It works on every paid event; a fixed
 * amount only on events priced in its currency. Each one can be copied,
 * changed, switched off and deleted. Stripe changes and deletes nothing
 * itself, so a change makes a new version in Stripe and a deletion switches
 * the code off there; lib/promotion-codes.ts explains.
 *
 * WHEN IT ASKS FIRST (Rares, 5 and 27 October 2026)
 *
 * Only when people received the code in one of her announcements and can
 * still use it: it is on, before its last day, with uses left. Then deleting
 * it, switching it off, or changing its word, its amount or its last day
 * breaks what their email told them, and the question says so and lists who
 * they are. Changing only the number of uses does not ask: nobody was
 * promised a number. A code that can no longer be used anyway asks nothing.
 *
 * Making a code, or renaming one, with a word that was emailed before asks
 * too, whatever became of that code: the people who received it could use
 * the new one.
 *
 * Every deletion can be undone for a few seconds from its message.
 */

const STATUS_STYLE: Record<CodeStatus, string> = {
  active: "bg-success/10 text-success",
  off: "bg-charcoal/5 text-charcoal-light",
  expired: "bg-charcoal/5 text-charcoal-light",
  used_up: "bg-charcoal/5 text-charcoal-light",
};

/** Whether people who received the code could use it at this moment: asked when she acts, not when the list was read. */
function usable(code: PromotionCodeView): boolean {
  return codeStatus(code, Date.now()) === "active";
}

/** Today in Romania, as the date input wants it: YYYY-MM-DD. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE }).format(new Date());
}

export default function CodesPage() {
  const { t, locale } = useAdminLocale();
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";
  useDocumentTitle(t("admin.codes"));
  const toast = useToast();
  const confirm = useConfirm();
  const ids = useId();

  // Read with the moment they were read, so a code's state ("Expirat") is
  // worked out against the same clock as the list, not the render's.
  const { data, loading, error, reload } = useAdminData(async () => ({
    codes: await listCodes(),
    now: Date.now(),
    today: today(),
  }));
  const codes = data?.codes;
  const now = data?.now ?? 0;
  const [busyId, setBusyId] = useState<string | null>(null);

  // A new form after each code made, so it starts empty.
  const [formKey, setFormKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [editing, setEditing] = useState<PromotionCodeView | null>(null);
  const [editError, setEditError] = useState("");

  const discountText = (c: { percentOff: number | null; amountOff: number | null; currency: string | null }) =>
    c.percentOff !== null ? `${c.percentOff}%` : c.amountOff !== null ? formatPaid(Math.round(c.amountOff * 100), c.currency, lang) : "";

  const usesText = (c: PromotionCodeView) =>
    c.maxRedemptions !== null
      ? t("admin.discounts.uses_of").replace("{used}", String(c.timesRedeemed)).replace("{max}", String(c.maxRedemptions))
      : t("admin.discounts.uses").replace("{used}", String(c.timesRedeemed));

  const untilText = (lastDay: string | null | undefined) =>
    lastDay ? t("admin.discounts.until").replace("{date}", eventDay(lastDay, lang)) : t("admin.discounts.no_end");

  /** A code's terms as its email gave them: "VARA10, 10%, până pe 31 oct. 2026". */
  const termsOf = (c: PromotionCodeView) =>
    [c.code, discountText(c), untilText(c.expiresAt ? lastDayOf(c.expiresAt) : null)].join(", ");

  const termsOfInput = (input: NewPromotionCode) =>
    [
      input.code,
      discountText({
        percentOff: input.kind === "percent" ? input.value : null,
        amountOff: input.kind === "amount" ? input.value : null,
        currency: input.kind === "amount" ? (input.currency ?? null) : null,
      }),
      untilText(input.lastDay),
    ].join(", ");

  /** A refusal from the server as a sentence. */
  const sentence = (failure: unknown) => {
    if (!(failure instanceof CodeError)) return t(adminErrorKey(toAdminError(failure)));
    if (failure.reason === "stripe") return t("admin.discounts.error_stripe").replace("{reason}", failure.message);
    if (failure.reason === "uses_below") {
      const used = failure.details.used ?? 0;
      return t(`admin.discounts.error_uses_below.${pluralForm(used, lang) === "zero" ? "other" : pluralForm(used, lang)}`)
        .replace("{count}", String(used))
        .replace("{min}", String(failure.details.min ?? used + 1));
    }
    return t(`admin.discounts.error_${failure.reason}`);
  };

  /** A refusal that means the list she acted on is out of date: say so and read it again. */
  const outOfDate = (failure: unknown) =>
    failure instanceof CodeError && (failure.reason === "stale" || failure.reason === "not_found");

  /** The people on a warning: names and addresses, in a box that scrolls when there are many. */
  const peopleList = (people: CodeRecipient[]) => (
    <ul className="mt-3 max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-sage/25 bg-white text-charcoal">
      {people.map((person) => (
        <li key={person.email} className="flex flex-wrap gap-x-2 px-3 py-1.5">
          <span className="font-medium">{person.fullName || person.email}</span>
          {person.fullName && <span className="min-w-0 break-all text-charcoal-light">{person.email}</span>}
        </li>
      ))}
    </ul>
  );

  /** "You emailed it to 12 people, who can still use it." and who they are. */
  const receivedWarning = (people: CodeRecipient[], then: ReactNode) => (
    <>
      <p>{countSentence(t, lang, "admin.discounts.warn_people", people.length)}</p>
      {peopleList(people)}
      <p className="mt-3">{then}</p>
    </>
  );

  /** "A code VARA10 was emailed to 12 people, last on…" for a word used before. */
  const reusedWarning = (word: string, people: CodeRecipient[]) => (
    <>
      <p>
        {countSentence(t, lang, "admin.discounts.warn_reused", people.length)
          .replace("{code}", word)
          .replace("{date}", shortDay(people[0].sentAt, lang))
          .replace("{subject}", people[0].subject || t("admin.announce.untitled"))}
      </p>
      {peopleList(people)}
      <p className="mt-3">{t("admin.discounts.warn_reused_then")}</p>
    </>
  );

  const create = async (input: NewPromotionCode) => {
    setFormError("");
    // A live code with the word is refused anyway; no point warning first.
    const live = codes?.some((c) => c.code.toUpperCase() === input.code && usable(c));
    setSaving(true);
    try {
      if (!live) {
        const before = await codeRecipients(input.code);
        if (before.length) {
          const { confirmed } = await confirm({
            title: t("admin.discounts.warn_reused_title").replace("{code}", input.code),
            body: reusedWarning(input.code, before),
            confirmLabel: t("admin.discounts.create"),
            tone: "danger",
          });
          if (!confirmed) return;
        }
      }
      const made = await createCode(input);
      toast.success(t("admin.discounts.created").replace("{code}", made.code));
      setFormKey((key) => key + 1);
      reload();
    } catch (failure) {
      setFormError(sentence(failure));
    } finally {
      setSaving(false);
    }
  };

  const save = async (code: PromotionCodeView, input: NewPromotionCode) => {
    setEditError("");
    const changes = changesBetween(code, input);
    if (!changes.word && !changes.discount && !changes.lastDay && !changes.uses) {
      setEditing(null);
      return;
    }
    setBusyId(code.id);
    try {
      // Who received it and can still use it, when the change alters what
      // their email told them; and who received the new word, if it is new.
      const received =
        usable(code) && (changes.word || changes.discount || changes.lastDay)
          ? await codeRecipients(code.code, code.wordSince)
          : [];
      const reused = changes.word ? await codeRecipients(input.code) : [];
      if (received.length || reused.length) {
        const sections: ReactNode[] = [];
        if (received.length) {
          sections.push(
            receivedWarning(
              received,
              <>
                {t("admin.discounts.warn_edit_terms")
                  .replace("{before}", termsOf(code))
                  .replace("{after}", termsOfInput(input))}{" "}
                {t("admin.discounts.warn_edit_then")}
              </>
            )
          );
        }
        if (reused.length) sections.push(reusedWarning(input.code, reused));
        const { confirmed } = await confirm({
          title: received.length
            ? t("admin.discounts.warn_edit_title").replace("{code}", code.code)
            : t("admin.discounts.warn_reused_title").replace("{code}", input.code),
          body: sections.map((section, i) => (
            <div key={i} className={i ? "mt-4 border-t border-sage/20 pt-4" : ""}>
              {section}
            </div>
          )),
          confirmLabel: t("admin.discounts.save"),
          tone: "danger",
        });
        if (!confirmed) return;
      }
      const saved = await editCode(code.id, input);
      toast.success(t("admin.discounts.saved").replace("{code}", saved.code));
      setEditing(null);
      reload();
    } catch (failure) {
      if (outOfDate(failure)) {
        setEditing(null);
        toast.error(sentence(failure));
        reload();
      } else {
        setEditError(sentence(failure));
      }
    } finally {
      setBusyId(null);
    }
  };

  const toggle = async (c: PromotionCodeView) => {
    setBusyId(c.id);
    try {
      if (c.active && usable(c)) {
        const people = await codeRecipients(c.code, c.wordSince);
        if (people.length) {
          const { confirmed } = await confirm({
            title: t("admin.discounts.warn_off_title").replace("{code}", c.code),
            body: receivedWarning(people, t("admin.discounts.warn_off_then")),
            confirmLabel: t("admin.discounts.off_confirm"),
            tone: "danger",
          });
          if (!confirmed) return;
        }
      }
      await setCodeActive(c.id, !c.active);
      toast.success(t(c.active ? "admin.discounts.turned_off" : "admin.discounts.turned_on").replace("{code}", c.code));
      reload();
    } catch (failure) {
      toast.error(sentence(failure));
      if (outOfDate(failure)) reload();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c: PromotionCodeView) => {
    setBusyId(c.id);
    try {
      if (usable(c)) {
        const people = await codeRecipients(c.code, c.wordSince);
        if (people.length) {
          const { confirmed } = await confirm({
            title: t("admin.discounts.warn_delete_title").replace("{code}", c.code),
            body: receivedWarning(people, t("admin.discounts.warn_delete_then")),
            confirmLabel: t("admin.discounts.delete_confirm"),
            tone: "danger",
          });
          if (!confirmed) return;
        }
      }
      await deleteCode(c.id);
      toast.success(t("admin.discounts.deleted").replace("{code}", c.code), {
        label: t("admin.discounts.undo"),
        onSelect: () => void undo(c),
      });
      reload();
    } catch (failure) {
      toast.error(sentence(failure));
      if (outOfDate(failure)) reload();
    } finally {
      setBusyId(null);
    }
  };

  const undo = async (c: PromotionCodeView) => {
    try {
      await restoreCode(c.id);
      toast.success(t("admin.discounts.restored").replace("{code}", c.code));
    } catch (failure) {
      toast.error(sentence(failure));
    } finally {
      reload();
    }
  };

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <PageHeader title={t("admin.codes")} description={t("admin.discounts.intro")} />

      <section
        aria-labelledby={`${ids}-new`}
        className="mb-8 rounded-2xl border border-sage/25 bg-warm-white p-5 sm:p-6"
      >
        <h2 id={`${ids}-new`} className="mb-4 font-serif text-xl text-charcoal">
          {t("admin.discounts.new")}
        </h2>
        <CodeForm
          key={formKey}
          today={data?.today}
          error={formError}
          onSubmit={create}
          footer={
            <>
              <p className="mt-5 max-w-prose text-sm text-charcoal-light">{t("admin.discounts.reference_price")}</p>
              <button
                type="submit"
                disabled={saving}
                className="mt-5 inline-flex h-11 items-center rounded-full bg-rose-deep px-5 text-sm font-medium text-white shadow-sm hover:bg-rose-deeper disabled:opacity-50"
              >
                {saving ? t("admin.saving") : t("admin.discounts.create")}
              </button>
            </>
          }
        />
      </section>

      <section aria-labelledby={`${ids}-list`}>
        <h2 id={`${ids}-list`} className="mb-3 font-serif text-xl text-charcoal">
          {t("admin.discounts.list")}
        </h2>
        {loading && !codes ? (
          <div className="flex justify-center py-10" role="status">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
            <span className="sr-only">{t("admin.loading")}</span>
          </div>
        ) : error ? (
          <p role="alert" className="text-error">
            {t("admin.discounts.error_list")}
          </p>
        ) : !codes?.length ? (
          <p className="rounded-2xl border border-dashed border-sage/40 px-6 py-10 text-center text-charcoal-light">
            {t("admin.discounts.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-sage/20 rounded-2xl border border-sage/25 bg-warm-white">
            {codes.map((c) => {
              const status = codeStatus(c, now);
              const busy = busyId === c.id;
              return (
                <li key={c.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className="break-all text-lg font-medium tracking-wide text-charcoal">{c.code}</span>
                          <CopyButton code={c.code} />
                        </span>
                        <span className="text-sm text-charcoal">{discountText(c)}</span>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLE[status])}>
                          {t(`admin.discounts.status_${status}`)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-charcoal-light">
                        {usesText(c)}
                        {", "}
                        {untilText(c.expiresAt ? lastDayOf(c.expiresAt) : null)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditError("");
                          setEditing(c);
                        }}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-sage/30 bg-white px-4 text-sm font-medium text-charcoal hover:bg-sage/10 disabled:opacity-50"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        {t("admin.discounts.edit")}
                        <span className="sr-only"> {c.code}</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toggle(c)}
                        className="min-h-11 rounded-full border border-sage/30 bg-white px-4 text-sm font-medium text-charcoal hover:bg-sage/10 disabled:opacity-50"
                      >
                        {t(c.active ? "admin.discounts.turn_off" : "admin.discounts.turn_on")}
                        <span className="sr-only"> {c.code}</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(c)}
                        aria-label={t("admin.discounts.delete_label").replace("{code}", c.code)}
                        data-tooltip={t("admin.discounts.delete_hint")}
                        data-tooltip-end
                        className="flex h-11 w-11 items-center justify-center rounded-full text-charcoal-light hover:bg-error/10 hover:text-error disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {c.sentTo > 0 && <CodeRecipients code={c} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && (
        <CodeDialog
          key={editing.id}
          code={editing}
          today={data?.today}
          expired={codeStatus(editing, now) === "expired"}
          busy={busyId === editing.id}
          error={editError}
          onSave={(input) => save(editing, input)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Copies the code, so she can paste it into a message without selecting it
 * (Rares, 5 October 2026). The icon turns into a tick for a moment where her
 * eyes already are; the message in the corner says the same for a screen
 * reader.
 */
function CopyButton({ code }: { code: string }) {
  const { t } = useAdminLocale();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
          toast.success(t("admin.discounts.copied").replace("{code}", code));
        } catch {
          toast.error(t("admin.discounts.copy_failed"));
        }
      }}
      aria-label={t("admin.discounts.copy_label").replace("{code}", code)}
      data-tooltip={t("admin.discounts.copy_hint")}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
    >
      {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
