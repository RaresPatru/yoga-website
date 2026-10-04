"use client";

import { useId, useState } from "react";
import { adminErrorKey, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { CodeError, createCode, listCodes, setCodeActive } from "@/lib/admin/promotion-codes";
import {
  CODE_CURRENCIES,
  normaliseCode,
  type DiscountKind,
  type PromotionCodeView,
} from "@/lib/promotion-codes";
import { formatPaid } from "@/lib/money";
import { cn, EVENT_TIME_ZONE } from "@/lib/utils";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";
import { useToast } from "@/components/admin/ui/toaster";

/**
 * Coduri de reducere: the promotion codes she puts in announcements, which
 * people type on Stripe's payment page. Made here so she never needs Stripe's
 * Dashboard for them (Rares, 3 October 2026), and kept in Stripe, which
 * applies them and counts their uses (lib/promotion-codes.ts).
 *
 * A code is a word, a percentage or a fixed amount off, and optionally a last
 * day and a number of uses in all. It works on every paid event; a fixed
 * amount only on events priced in its currency. A code cannot be deleted once
 * made, only turned off, because Stripe keeps every code that may have been
 * used.
 */

type Status = "active" | "off" | "expired" | "used_up";

function statusOf(code: PromotionCodeView, now: number): Status {
  if (!code.active) return "off";
  if (code.expiresAt && Date.parse(code.expiresAt) <= now) return "expired";
  if (code.maxRedemptions !== null && code.timesRedeemed >= code.maxRedemptions) return "used_up";
  return "active";
}

const STATUS_STYLE: Record<Status, string> = {
  active: "bg-success/10 text-success",
  off: "bg-charcoal/5 text-charcoal-light",
  expired: "bg-charcoal/5 text-charcoal-light",
  used_up: "bg-charcoal/5 text-charcoal-light",
};

/** Today in Romania, as the date input wants it: YYYY-MM-DD. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE }).format(new Date());
}

/** The last day a code works, from the moment it stops (midnight after that day, in Romania). */
function lastDayOf(expiresAt: string, lang: "ro" | "en"): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: EVENT_TIME_ZONE,
  }).format(new Date(Date.parse(expiresAt) - 1000));
}

export default function CodesPage() {
  const { t, locale } = useAdminLocale();
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";
  useDocumentTitle(t("admin.codes"));
  const toast = useToast();
  const ids = useId();

  // Read with the moment they were read, so a code's state ("Expirat") is
  // worked out against the same clock as the list, not the render's.
  const { data, loading, error, reload } = useAdminData(async () => ({
    codes: await listCodes(),
    now: Date.now(),
    today: today(),
  }));
  const codes = data?.codes;
  const [busyId, setBusyId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [kind, setKind] = useState<DiscountKind>("percent");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState<string>("RON");
  const [lastDay, setLastDay] = useState("");
  const [uses, setUses] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const discountText = (c: PromotionCodeView) =>
    c.percentOff !== null ? `${c.percentOff}%` : c.amountOff !== null ? formatPaid(Math.round(c.amountOff * 100), c.currency, lang) : "";

  const usesText = (c: PromotionCodeView) =>
    c.maxRedemptions !== null
      ? t("admin.discounts.uses_of").replace("{used}", String(c.timesRedeemed)).replace("{max}", String(c.maxRedemptions))
      : t("admin.discounts.uses").replace("{used}", String(c.timesRedeemed));

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const made = await createCode({
        code: normaliseCode(code),
        kind,
        value: Number(value.replace(",", ".")),
        currency: kind === "amount" ? currency : undefined,
        lastDay: lastDay || undefined,
        maxRedemptions: uses ? Number(uses) : null,
      });
      toast.success(t("admin.discounts.created").replace("{code}", made.code));
      setCode("");
      setValue("");
      setLastDay("");
      setUses("");
      reload();
    } catch (failure) {
      setFormError(
        failure instanceof CodeError && failure.reason !== "stripe"
          ? t(`admin.discounts.error_${failure.reason}`)
          : failure instanceof CodeError
            ? t("admin.discounts.error_stripe").replace("{reason}", failure.message)
            : t(adminErrorKey(toAdminError(failure)))
      );
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: PromotionCodeView) => {
    setBusyId(c.id);
    try {
      await setCodeActive(c.id, !c.active);
      toast.success(t(c.active ? "admin.discounts.turned_off" : "admin.discounts.turned_on").replace("{code}", c.code));
      reload();
    } catch (failure) {
      toast.error(
        failure instanceof CodeError
          ? t("admin.discounts.error_stripe").replace("{reason}", failure.message)
          : t(adminErrorKey(toAdminError(failure)))
      );
    } finally {
      setBusyId(null);
    }
  };

  const field =
    "h-11 w-full rounded-xl border border-sage/30 bg-white px-3 text-base text-charcoal focus:border-rose-deep focus:outline-none sm:text-sm";
  const label = "text-sm font-medium text-charcoal";
  const hint = "mt-1 text-xs text-charcoal-light";
  const now = data?.now ?? 0;

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <PageHeader title={t("admin.codes")} description={t("admin.discounts.intro")} />

      <form
        onSubmit={create}
        aria-labelledby={`${ids}-new`}
        className="mb-8 rounded-2xl border border-sage/25 bg-warm-white p-5 sm:p-6"
      >
        <h2 id={`${ids}-new`} className="font-serif text-xl text-charcoal">
          {t("admin.discounts.new")}
        </h2>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-code`} className={label}>
              {t("admin.discounts.code")}
            </label>
            <input
              id={`${ids}-code`}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              aria-describedby={`${ids}-code-hint`}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              maxLength={30}
              pattern="[A-Za-z0-9\-]{3,30}"
              className={cn(field, "font-medium tracking-wide")}
            />
            <p id={`${ids}-code-hint`} className={hint}>
              {t("admin.discounts.code_hint")}
            </p>
          </div>

          <fieldset>
            <legend className={label}>{t("admin.discounts.discount")}</legend>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
              {(["percent", "amount"] as const).map((option) => (
                <label key={option} className="flex min-h-10 items-center gap-2 text-sm text-charcoal">
                  <input
                    type="radio"
                    name={`${ids}-kind`}
                    value={option}
                    checked={kind === option}
                    onChange={() => setKind(option)}
                    className="h-4 w-4 accent-rose-deep"
                  />
                  {t(`admin.discounts.kind_${option}`)}
                </label>
              ))}
            </div>
            <div className="mt-1 flex gap-2">
              <label htmlFor={`${ids}-value`} className="sr-only">
                {t(kind === "percent" ? "admin.discounts.value_percent" : "admin.discounts.value_amount")}
              </label>
              <input
                id={`${ids}-value`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                required
                autoComplete="off"
                className={cn(field, "min-w-0 flex-1")}
              />
              {kind === "percent" ? (
                <span className="flex h-11 items-center px-1 text-sm text-charcoal-light" aria-hidden="true">
                  %
                </span>
              ) : (
                <select
                  aria-label={t("admin.discounts.currency")}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="admin-select h-11 rounded-xl border border-sage/30 bg-white px-3 text-base text-charcoal sm:text-sm"
                >
                  {CODE_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {kind === "amount" && <p className={hint}>{t("admin.discounts.amount_hint")}</p>}
          </fieldset>

          <div>
            <label htmlFor={`${ids}-last`} className={label}>
              {t("admin.discounts.last_day")}
            </label>
            <input
              id={`${ids}-last`}
              type="date"
              value={lastDay}
              min={data?.today}
              onChange={(e) => setLastDay(e.target.value)}
              aria-describedby={`${ids}-last-hint`}
              className={field}
            />
            <p id={`${ids}-last-hint`} className={hint}>
              {t("admin.discounts.last_day_hint")}
            </p>
          </div>

          <div>
            <label htmlFor={`${ids}-uses`} className={label}>
              {t("admin.discounts.max_uses")}
            </label>
            <input
              id={`${ids}-uses`}
              value={uses}
              onChange={(e) => setUses(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoComplete="off"
              aria-describedby={`${ids}-uses-hint`}
              className={field}
            />
            <p id={`${ids}-uses-hint`} className={hint}>
              {t("admin.discounts.max_uses_hint")}
            </p>
          </div>
        </div>

        <p className="mt-5 max-w-prose text-sm text-charcoal-light">{t("admin.discounts.reference_price")}</p>

        {formError && (
          <p role="alert" className="mt-4 text-sm text-error">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 inline-flex h-11 items-center rounded-full bg-rose-deep px-5 text-sm font-medium text-white shadow-sm hover:bg-rose-deeper disabled:opacity-50"
        >
          {saving ? t("admin.saving") : t("admin.discounts.create")}
        </button>
      </form>

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
          <ul className="divide-y divide-sage/20 overflow-hidden rounded-2xl border border-sage/25 bg-warm-white">
            {codes.map((c) => {
              const status = statusOf(c, now);
              return (
                <li key={c.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="break-all text-lg font-medium tracking-wide text-charcoal">{c.code}</span>
                      <span className="text-sm text-charcoal">{discountText(c)}</span>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLE[status])}>
                        {t(`admin.discounts.status_${status}`)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-charcoal-light">
                      {usesText(c)}
                      {", "}
                      {c.expiresAt
                        ? t("admin.discounts.until").replace("{date}", lastDayOf(c.expiresAt, lang))
                        : t("admin.discounts.no_end")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => toggle(c)}
                    className="min-h-11 shrink-0 self-start rounded-full border border-sage/30 bg-white px-4 text-sm font-medium text-charcoal hover:bg-sage/10 disabled:opacity-50 sm:self-auto"
                  >
                    {t(c.active ? "admin.discounts.turn_off" : "admin.discounts.turn_on")}
                    <span className="sr-only"> {c.code}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
