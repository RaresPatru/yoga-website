"use client";

import { useId, useState, type ReactNode } from "react";
import { CODE_CURRENCIES, normaliseCode, type DiscountKind, type NewPromotionCode } from "@/lib/promotion-codes";
import { cn } from "@/lib/utils";
import { useAdminLocale } from "@/components/admin/locale-provider";

/**
 * The fields of a discount code: the word, how much off, the last day and
 * the number of uses. The Coduri de reducere page uses it to make a code, and
 * the edit dialog to change one (components/admin/codes/code-dialog.tsx).
 *
 * TWO COLUMNS WHEN THERE IS ROOM FOR THEM, AND THEIR BOXES IN LINE
 *
 * The layout answers the width it is given, not the screen's (a container
 * query): two columns on the page on a computer, one in the narrower dialog
 * and on a phone.
 *
 * In two columns the boxes beside each other sit on one line. They did not
 * (Rares, 5 October 2026): "Reducerea" carried its two radio buttons on a line
 * of their own under its label, so its box sat a radio row lower than the
 * code's. The radios now share the label's line, and each pair of fields is a
 * grid whose fields borrow its rows (subgrid) — label, box, hint — so the two
 * boxes share a row whatever stands above them: a label that wraps, or the
 * radios, which are taller than a label because each is a 40px target.
 * Labels sit at the bottom of their row, against their box.
 */
export function CodeForm({
  initial,
  today,
  usedSoFar,
  expired,
  error,
  footer,
  onSubmit,
}: {
  /** The code being edited; empty for a new one. */
  initial?: NewPromotionCode;
  /** Today in Romania, the earliest last day allowed. */
  today?: string;
  /** For an edit: how often it has been used, which the limit has to stay above. */
  usedSoFar?: number;
  /** For an edit: the code is past its last day. */
  expired?: boolean;
  error: string;
  /** The buttons, which differ between making and editing. */
  footer: ReactNode;
  onSubmit: (input: NewPromotionCode) => void;
}) {
  const { t } = useAdminLocale();
  const ids = useId();
  const [code, setCode] = useState(initial?.code ?? "");
  const [kind, setKind] = useState<DiscountKind>(initial?.kind ?? "percent");
  const [value, setValue] = useState(initial ? String(initial.value) : "");
  const [currency, setCurrency] = useState<string>(initial?.currency ?? "RON");
  const [lastDay, setLastDay] = useState(initial?.lastDay ?? "");
  const [uses, setUses] = useState(initial?.maxRedemptions ? String(initial.maxRedemptions) : "");

  const field =
    "h-11 w-full rounded-xl border border-sage/30 bg-white px-3 text-base text-charcoal focus:border-rose-deep focus:outline-none sm:text-sm";
  const label = "self-end text-sm font-medium text-charcoal";
  const hint = "text-xs text-charcoal-light";
  // A pair of fields, and a field inside one: see the note above.
  const pair = "grid gap-y-5 @xl:grid-cols-2 @xl:gap-x-5 @xl:gap-y-1";
  const cell = "grid content-start gap-1 @xl:row-span-3 @xl:grid-rows-subgrid";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          code: normaliseCode(code),
          kind,
          value: Number(value.replace(",", ".")),
          currency: kind === "amount" ? currency : undefined,
          lastDay: lastDay || undefined,
          maxRedemptions: uses ? Number(uses) : null,
        });
      }}
      className="@container"
    >
      <div className="space-y-5">
        <div className={pair}>
          <div className={cell}>
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

          {/* A group rather than a <fieldset>: a legend is drawn in the
              fieldset's border, outside its grid, so it could not take part
              in the shared rows. */}
          <div role="group" aria-labelledby={`${ids}-discount`} className={cell}>
            <div className="flex flex-wrap items-center gap-x-4 self-end">
              <span id={`${ids}-discount`} className="text-sm font-medium text-charcoal">
                {t("admin.discounts.discount")}
              </span>
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
            <div className="flex gap-2">
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
            <p className={hint}>{kind === "amount" ? t("admin.discounts.amount_hint") : ""}</p>
          </div>
        </div>

        <div className={pair}>
          <div className={cell}>
            <label htmlFor={`${ids}-last`} className={label}>
              {t("admin.discounts.last_day")}
            </label>
            <input
              id={`${ids}-last`}
              type="date"
              value={lastDay}
              min={today}
              onChange={(e) => setLastDay(e.target.value)}
              aria-describedby={`${ids}-last-hint`}
              className={field}
            />
            <p id={`${ids}-last-hint`} className={hint}>
              {expired ? t("admin.discounts.last_day_expired") : t("admin.discounts.last_day_hint")}
            </p>
          </div>

          <div className={cell}>
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
              {usedSoFar !== undefined && <> {t("admin.discounts.used_so_far").replace("{used}", String(usedSoFar))}</>}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-error">
          {error}
        </p>
      )}

      {footer}
    </form>
  );
}
