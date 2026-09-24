"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { adminErrorKey, must, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useNewFromLink } from "@/lib/admin/use-new-from-link";
import { useToast } from "@/components/admin/ui/toaster";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { getAuthToken } from "@/lib/get-auth-token";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Edit2, Trash2, Users, X, Loader2, Languages, Info } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";
import { WhatsappLinkField } from "@/components/admin/whatsapp-link-field";
import { CURRENCIES, CURRENCY_SYMBOLS, DEFAULT_CURRENCY, formatPrice } from "@/lib/money";

type SpellcheckLang = "ro" | "en" | "off";

/**
 * One event row. The date/time columns are wall-clock times in
 * Europe/Bucharest; a NULL time means she has not announced it yet, and a NULL
 * end date means it ends on the day it starts (see 20260919000000_event_end.sql).
 */
type Event = Database["public"]["Tables"]["events"]["Row"];

/**
 * What the form hands back to be saved: the editable columns, plus the id when
 * the event exists. `starts_at` and `ends_at` are left out because Postgres
 * computes them and refuses a write to either (20260924000200_event_bounds.sql);
 * `show_in_archive` because this form has no control for it yet, so a save
 * leaves it as it was.
 */
type EventDraft = Omit<
  Event,
  "id" | "created_at" | "updated_at" | "starts_at" | "ends_at" | "show_in_archive"
> & { id?: string };

interface WaitingEntry {
  id: string;
  event_id: string;
  full_name: string;
  email: string;
  phone: string;
  created_at: string;
  claimed_at: string | null;
}

function WaitingListModal({
  event,
  onClose,
}: {
  event: Event;
  onClose: () => void;
}) {
  const { t } = useAdminLocale();
  const [entries, setEntries] = useState<WaitingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("waiting_list")
      .select("*")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setEntries(data);
        setLoading(false);
      });
  }, [event.id]);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const handleClose = () => onClose();
    dialog?.addEventListener("close", handleClose);
    return () => dialog?.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="m-auto max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg rounded-2xl bg-transparent p-0 backdrop:bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard hover={false} className="max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg text-charcoal">{t("admin.waiting_list")}</h2>
          <button onClick={onClose} aria-label={t("admin.close")} className="rounded-full p-1 hover:bg-sage/10">
            <X className="h-5 w-5 text-charcoal-light" />
          </button>
        </div>
        <p className="mb-4 text-sm text-charcoal-light">{event.title_ro} — {event.date}</p>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" />
          </div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-charcoal-light">{t("admin.no_waiting_list")}</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-sage/20 bg-white/50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-charcoal">{entry.full_name}</p>
                  <p className="text-xs text-charcoal-light">{entry.email} — {entry.phone}</p>
                  <p className="text-xs text-charcoal-light/60">
                    {new Date(entry.created_at).toLocaleString("ro-RO")}
                  </p>
                </div>
                {entry.claimed_at ? (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                    Revendicat
                  </span>
                ) : (
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
                    În așteptare
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </dialog>
  );
}

function EventForm({
  event,
  onSave,
  onCancel,
}: {
  event?: Event | null;
  onSave: (data: EventDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useAdminLocale();
  const toast = useToast();
  const [form, setForm] = useState({
    slug: event?.slug || "",
    title_ro: event?.title_ro || "",
    title_en: event?.title_en || "",
    description_ro: event?.description_ro || "",
    description_en: event?.description_en || "",
    date: event?.date || "",
    // Sliced because Postgres hands back "18:30:00" and `<input type="time">`
    // shows an empty box for anything that is not "HH:MM" — which reads as the
    // time having been lost every time she reopens an event to edit it.
    time: event?.time?.slice(0, 5) || "",
    end_date: event?.end_date || "",
    end_time: event?.end_time?.slice(0, 5) || "",
    location: event?.location || "",
    map_link: event?.map_link || "",
    price: event?.price?.toString() || "0",
    currency: event?.currency || DEFAULT_CURRENCY,
    max_participants: event?.max_participants?.toString() || "",
    image_url: event?.image_url || "",
    whatsapp_group_link: event?.whatsapp_group_link || "",
    published: event?.published || false,
  });
  const [saving, setSaving] = useState(false);
  /*
   * Only set when she has actually tried to save.
   *
   * A required field that complains before anybody has typed in it is the
   * commonest way to make a form feel hostile — it opens already telling you
   * you are wrong. The browser's own `:user-invalid` exists for this and waits
   * for a blur or a submit; there is no <form> here to submit, so the wait is
   * expressed as "this is empty until handleSave says otherwise". The Input
   * component turns it into `aria-invalid` plus a `role="alert"` message.
   */
  const [endError, setEndError] = useState<string | null>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const [translatingTitle, setTranslatingTitle] = useState(false);
  const [translatingDesc, setTranslatingDesc] = useState(false);
  const [spell, setSpell] = useState<SpellcheckLang>("ro");
  const [showSpellTooltip, setShowSpellTooltip] = useState(false);
  const spellTooltipRef = useRef<HTMLDivElement>(null);

  const translateText = async (text: string): Promise<string> => {
    const token = await getAuthToken();
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ text, from: "ro", to: "en" }),
    });
    if (!res.ok) throw new Error("Translation failed");
    const data = await res.json();
    return data.translatedText;
  };

  const handleTranslateTitle = async () => {
    if (!form.title_ro.trim()) return;
    setTranslatingTitle(true);
    try {
      const translated = await translateText(form.title_ro);
      setForm({ ...form, title_en: translated });
    } catch {
      toast.error(t("admin.translate_error"));
    } finally {
      setTranslatingTitle(false);
    }
  };

  const handleTranslateDesc = async () => {
    if (!form.description_ro.trim()) return;
    setTranslatingDesc(true);
    try {
      const translated = await translateText(form.description_ro);
      setForm({ ...form, description_en: translated });
    } catch {
      toast.error(t("admin.translate_error"));
    } finally {
      setTranslatingDesc(false);
    }
  };

  const toggleSpellcheck = () => {
    setSpell((prev) => (prev === "ro" ? "en" : prev === "en" ? "off" : "ro"));
    setShowSpellTooltip(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (spellTooltipRef.current && !spellTooltipRef.current.contains(e.target as Node)) {
        setShowSpellTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const spellLabel = spell === "ro" ? "RO" : spell === "en" ? "EN" : "ABC";

  /**
   * Clamped here as well as in the database.
   *
   * The CHECK constraints in 20260810000001 are what actually make a negative
   * price impossible — this form writes to Supabase directly, so nothing in
   * JavaScript can be the guarantee. But a constraint violation surfaces as an
   * opaque failed save, and "why won't it save" is a bad way to discover you
   * typed a minus sign. `Math.max(0, …)` and the `min` attributes below mean
   * she never reaches the constraint by accident; the constraint is there for
   * everything that is not an accident.
   *
   * Capacity is clamped to 1 rather than 0: a zero-capacity event is
   * indistinguishable from a sold-out one, so it would quietly stop anyone
   * booking. Blank still means "no limit".
   */
  const handleSave = async () => {
    setSaving(true);
    const price = Math.max(0, Math.trunc(Number(form.price) || 0));
    /*
     * Blank stays NULL and zero stays zero, because both now mean sold out.
     *
     * This used to floor at 1, which quietly turned "0" into "1" — she would
     * type zero to mark an event already full and get one bookable seat back.
     * `Number("")` is 0, so the blank check has to come first and has to test
     * the string, not the number.
     */
    const typed = form.max_participants.trim();
    const capacity = typed === "" ? null : Math.max(0, Math.trunc(Number(typed) || 0));

    /*
     * An end before its start is the one combination worth stopping here.
     *
     * The database refuses it too (`events_ends_after_start`, in
     * 20260924000200_event_bounds.sql), but a constraint violation surfaces as
     * a failed save with no explanation, and she would be left guessing which
     * of four fields it meant. `min` on the input catches most of it, and is
     * advisory because there is no <form> to run native validation.
     *
     * The rule is the database's, in the same terms: a blank end date means the
     * event ends on the day it starts, and a blank start time counts as
     * midnight. So 18:00 to 10:00 on one day is refused whether or not she
     * filled in the end date.
     *
     * Everything else about these four is allowed to be blank. Blank is a real
     * answer: she has not announced it yet.
     */
    const endDate = form.end_date.trim() || null;
    const endTime = form.end_time.trim() || null;
    const startTime = form.time.trim() || null;
    const lastDay = endDate ?? form.date;

    const endsBeforeStart =
      lastDay < form.date ||
      (lastDay === form.date && endTime !== null && endTime <= (startTime ?? "00:00"));

    if (endsBeforeStart) {
      setEndError(t("admin.end_before_start"));
      setSaving(false);
      // Native submit would focus the first invalid field; there is no native
      // submit, so this does it by hand. Without it the message can be off
      // screen on the phone she edits from.
      endRef.current?.focus();
      return;
    }
    setEndError(null);

    if (!form.title_ro.trim() || !form.slug.trim() || !form.date) {
      toast.error(t("admin.errors.missing"));
      setSaving(false);
      return;
    }

    // A failed save throws from the page and leaves the form open with what
    // she typed (audit B5); only a successful save closes it.
    try {
      await onSave({
      id: event?.id,
      ...form,
      slug: form.slug.trim(),
      title_en: form.title_en || null,
      description_ro: form.description_ro || null,
      description_en: form.description_en || null,
      location: form.location || null,
      image_url: form.image_url || null,
      whatsapp_group_link: form.whatsapp_group_link || null,
      price,
      max_participants: capacity,
      // Blank is NULL, not "": the columns mean "not announced yet", and an
      // empty string would be a value that renders the same while making
      // `where end_date is null` stop finding the events that have no end.
      time: startTime,
      end_date: endDate,
      end_time: endTime,
      // Trimmed to NULL rather than spread through as "". The column comment in
      // 20260918000001_event_map_link.sql says NULL means she has not supplied
      // one, and an empty string renders identically while making
      // `where map_link is null` stop finding the events that have no pin.
      map_link: form.map_link.trim() || null,
      });
    } catch (error) {
      toast.error(t(adminErrorKey(toAdminError(error))));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl text-charcoal">
          {event ? t("admin.edit_event") : t("admin.new_event")}
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>{t("admin.cancel")}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("admin.saving") : t("admin.save")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input label={t("admin.title_ro")} value={form.title_ro} onChange={(e) => setForm({...form, title_ro: e.target.value})} spellCheck={spell !== "off"} lang={spell === "ro" ? "ro-RO" : "en"} />
            </div>
            <button
              onClick={handleTranslateTitle}
              disabled={translatingTitle || !form.title_ro.trim()}
              data-tooltip={t("admin.translate_to_en")}
              className="mb-1.5 flex h-10 items-center gap-1.5 rounded-xl border border-sage/30 bg-white/60 px-3 text-xs font-medium text-charcoal-light backdrop-blur-sm transition-all hover:border-rose/30 hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {translatingTitle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {translatingTitle ? t("admin.translating") : "→ EN"}
            </button>
          </div>
        </div>
        <Input label={t("admin.title_en")} value={form.title_en} onChange={(e) => setForm({...form, title_en: e.target.value})} spellCheck={spell !== "off"} lang={spell === "ro" ? "ro-RO" : "en"} />
      </div>

      <Input label={t("admin.slug")} value={form.slug} onChange={(e) => setForm({...form, slug: e.target.value})} placeholder="nume-eveniment" />

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-sm font-medium text-charcoal-light">{t("admin.description_ro")}</label>
            <button
              onClick={handleTranslateDesc}
              disabled={translatingDesc || !form.description_ro.trim()}
              data-tooltip={t("admin.translate_to_en")}
              className="flex items-center gap-1.5 rounded-lg border border-sage/30 bg-white/60 px-2.5 py-1 text-xs font-medium text-charcoal-light backdrop-blur-sm transition-all hover:border-rose/30 hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {translatingDesc ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {translatingDesc ? t("admin.translating") : "→ EN"}
            </button>
          </div>
          <textarea
            value={form.description_ro}
            onChange={(e) => setForm({...form, description_ro: e.target.value})}
            rows={4}
            spellCheck={spell !== "off"}
            lang={spell === "ro" ? "ro-RO" : "en"}
            className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 font-sans text-sm text-charcoal placeholder:text-charcoal-light/50 backdrop-blur-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-charcoal-light">{t("admin.description_en")}</label>
          <textarea
            value={form.description_en}
            onChange={(e) => setForm({...form, description_en: e.target.value})}
            rows={4}
            spellCheck={spell !== "off"}
            lang={spell === "ro" ? "ro-RO" : "en"}
            className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 font-sans text-sm text-charcoal placeholder:text-charcoal-light/50 backdrop-blur-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={toggleSpellcheck}
            className="flex items-center gap-1.5 rounded-xl border border-sage/30 bg-white/60 px-3 py-2 text-xs font-medium text-charcoal-light backdrop-blur-sm transition-all hover:border-rose/30 hover:text-rose-deep"
          >
            <Languages className="h-3.5 w-3.5" />
            <span>{spellLabel}</span>
          </button>
          {spell === "ro" && (
            <>
              <button
                onMouseEnter={() => setShowSpellTooltip(true)}
                onMouseLeave={() => setShowSpellTooltip(false)}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-warning/20 text-warning hover:bg-warning/30"
              >
                <Info className="h-3 w-3" />
              </button>
              {showSpellTooltip && (
                <div
                  ref={spellTooltipRef}
                  className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-sage/20 bg-white/95 p-3 shadow-xl backdrop-blur-xl"
                >
                  <p className="text-xs leading-relaxed text-charcoal-light">
                    Dacă sublinierile roșii nu apar pentru limba română, adaugă dicționarul românesc în
                    Chrome Settings → Languages → Spell check.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/*
        Start and end, laid out as two pairs rather than four equal boxes, so
        the grouping is visible before anything is read: a date next to its own
        time, and the second pair plainly the counterpart of the first.

        Only the start date is required. She books a venue for a weekend in
        March and announces it long before she knows what time Friday begins;
        the fields she cannot answer yet stay empty and the page says nothing
        about them rather than inventing an hour.
      */}
      <div className="grid gap-4 md:grid-cols-4">
        <Input
          label={t("admin.date")}
          type="date"
          required
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <Input
          label={t("admin.time")}
          type="time"
          value={form.time}
          onChange={(e) => setForm({ ...form, time: e.target.value })}
          hint={t("admin.time_hint")}
        />
        <Input
          ref={endRef}
          label={t("admin.end_date")}
          type="date"
          // The browser refuses an earlier date where it can, which is the
          // cheap half of the check. The database constraint is the half that
          // actually holds, because `min` is advisory without a <form>.
          min={form.date || undefined}
          value={form.end_date}
          onChange={(e) => {
            setForm({ ...form, end_date: e.target.value });
            if (endError) setEndError(null);
          }}
          error={endError ?? undefined}
          hint={t("admin.end_date_hint")}
        />
        <Input
          label={t("admin.end_time")}
          type="time"
          value={form.end_time}
          onChange={(e) => {
            setForm({ ...form, end_time: e.target.value });
            if (endError) setEndError(null);
          }}
          hint={t("admin.end_time_hint")}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input label={t("admin.location")} value={form.location} onChange={(e) => setForm({...form, location: e.target.value})} />
        <Input
          label={t("admin.map_link")}
          value={form.map_link}
          onChange={(e) => setForm({...form, map_link: e.target.value})}
          inputMode="url"
          placeholder="https://maps.app.goo.gl/..."
          hint={t("admin.map_link_hint")}
        />

        {/* Price and its currency read as one field, so they sit in one box. */}
        <div className="space-y-1.5">
          <label htmlFor="event-price" className="text-sm font-medium text-charcoal-light">
            {t("admin.price")}
          </label>
          <div className="flex gap-2">
            <input
              id="event-price"
              type="number"
              // `min` and `step` are the browser's own guard rails: the spinner
              // will not go below zero and a decimal is rejected on submit.
              // They are a convenience, not the rule — see handleSave.
              min={0}
              step={1}
              inputMode="numeric"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="min-w-0 flex-1 rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal backdrop-blur-sm"
            />
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              aria-label={t("admin.currency")}
              className="w-24 shrink-0 rounded-xl border border-sage/30 bg-white/60 px-2 py-3 text-sm text-charcoal backdrop-blur-sm"
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code} {CURRENCY_SYMBOLS[code]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Input
          label={t("admin.max_participants")}
          type="number"
          // How many people can book on the website, which is the only place
          // anyone can book: Instagram carries the announcement and sends them
          // here. So this is the room, minus any places she is holding back —
          // lowering 15 to 13 keeps two for a collaborator or a gift.
          //
          // Zero closes bookings and leaves only the waiting list; blank means
          // she has not said yet, and is treated the same way. Raising the
          // number again releases the queue, which is what the note under the
          // field is warning about. Negatives floor to zero.
          min={0}
          step={1}
          inputMode="numeric"
          hint={t("admin.max_participants_hint")}
          value={form.max_participants}
          onChange={(e) => setForm({...form, max_participants: e.target.value})}
        />
        <Input label={t("admin.image_url")} value={form.image_url} onChange={(e) => setForm({...form, image_url: e.target.value})} />
        <WhatsappLinkField
          value={form.whatsapp_group_link}
          onChange={(url) => setForm({ ...form, whatsapp_group_link: url })}
        />
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={form.published}
          onChange={(e) => setForm({...form, published: e.target.checked})}
          className="h-4 w-4 rounded border-sage/30 accent-rose-deep"
        />
        <span className="text-sm text-charcoal-light">{t("admin.published")}</span>
      </label>
    </div>
  );
}

export default function AdminEventsPage() {
  const { t, locale } = useAdminLocale();
  useDocumentTitle(t("admin.events"));
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Event | null>(null);
  // The dashboard's "Eveniment nou" opens this page with the empty form showing.
  const openedForNew = useNewFromLink();
  const [creating, setCreating] = useState(openedForNew);
  const [waitingFor, setWaitingFor] = useState<Event | null>(null);
  /*
   * How many claim links the last save sent, when it sent any.
   *
   * Saving an event can email people in her name, which she has to be told
   * about — she wrote none of it and it goes out under her address. Announced
   * rather than silent, and dismissible rather than timed, because the number
   * matters: it is how many seats she has just promised away.
   */
  const [notified, setNotified] = useState<number | null>(null);

  /** Every event, newest first, with how many registrations and waiting-list entries each has. */
  const { data, loading, error: loadError, reload } = useAdminData(async () => {
    const supabase = createClient();
    const events = must(
      await supabase.from("events").select("*").order("date", { ascending: false })
    ) ?? [];
    const ids = events.map((e) => e.id);

    const [registrations, waiting] = await Promise.all([
      supabase.from("registrations").select("event_id").in("event_id", ids),
      supabase.from("waiting_list").select("event_id").in("event_id", ids),
    ]);

    const counts: Record<string, { registrations: number; waiting: number }> = {};
    for (const id of ids) counts[id] = { registrations: 0, waiting: 0 };
    for (const r of must(registrations) ?? []) counts[r.event_id].registrations++;
    for (const w of must(waiting) ?? []) counts[w.event_id].waiting++;

    return { events, counts };
  });
  const events = data?.events ?? [];
  const counts = data?.counts ?? {};

  /** Saves the event; throws on failure so the form can stay open (B5). */
  const handleSave = async ({ id, ...fields }: EventDraft) => {
    const supabase = createClient();
    let eventId = id;
    if (id) {
      must(await supabase.from("events").update(fields).eq("id", id));
    } else {
      // The id comes back from the insert because the next step needs it, and
      // asking the database which event we just wrote is worse than being told.
      const created = must(
        await supabase.from("events").insert(fields).select("id").single()
      );
      eventId = created?.id;
    }
    toast.success(t("admin.toast.saved"));
    setEditing(null);
    setCreating(false);
    void reload();

    /*
     * Let the waiting list know, if there is anything to tell it.
     *
     * Fired after every save rather than only after a capacity change, which is
     * both simpler and more correct: the route counts the free seats itself, so
     * a save that leaves none does nothing, and a save that leaves some
     * releases the queue whether or not capacity is what moved. An event can
     * become bookable again without her touching the number at all — a pending
     * checkout that was holding the last seat simply expires.
     *
     * It cannot be done from here directly. Emailing needs the service-role
     * key, which is a server secret, and the panel runs in her browser.
     */
    if (!eventId) return;
    try {
      const response = await fetch("/api/admin/events/notify-waiting-list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({ eventId }),
      });
      const { notified } = await response.json();
      if (notified > 0) setNotified(notified);
    } catch (error) {
      // A failure here must not read as a failed save — the event is saved.
      // She can release the queue by saving again.
      console.error("Waiting list notification failed:", error);
    }
  };

  const handleDelete = async (event: Event) => {
    const { confirmed } = await confirm({
      title: t("admin.confirm_delete_event"),
      body: event.title_ro,
      confirmLabel: t("admin.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const supabase = createClient();
      must(await supabase.from("events").delete().eq("id", event.id));
      toast.success(t("admin.toast.deleted"));
      void reload();
    } catch (error) {
      toast.error(t(adminErrorKey(toAdminError(error))));
    }
  };

  if (creating || editing) {
    return <EventForm event={editing} onSave={handleSave} onCancel={() => { setCreating(false); setEditing(null); }} />;
  }

  return (
    <div>
      {waitingFor && (
        <WaitingListModal event={waitingFor} onClose={() => setWaitingFor(null)} />
      )}

      <PageHeader
        title={t("admin.events")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> {t("admin.new_event")}
          </Button>
        }
      />

      {notified !== null && (
        // `role="status"` rather than `alert`: this is the outcome of something
        // she just did, not an interruption, so it is read after whatever the
        // screen reader is already saying rather than cutting across it.
        <div
          role="status"
          className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-sage/30 bg-sage/10 px-4 py-3 text-sm text-charcoal"
        >
          <span>{t("admin.waiting_list_notified").replace("{count}", String(notified))}</span>
          <button
            type="button"
            onClick={() => setNotified(null)}
            aria-label={t("admin.close")}
            className="shrink-0 rounded-sm text-charcoal-light transition-colors hover:text-charcoal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      ) : loadError ? (
        <p role="alert" className="text-error">{t(adminErrorKey(loadError))}</p>
      ) : events.length === 0 ? (
        <p className="text-charcoal-light">{t("admin.no_events")}</p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const c = counts[event.id];
            return (
              <GlassCard key={event.id} hover={false} className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-charcoal">{event.title_ro}</h3>
                    {event.published ? (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">{t("admin.published")}</span>
                    ) : (
                      <span className="rounded-full bg-charcoal-light/10 px-2 py-0.5 text-xs text-charcoal-light">{t("admin.draft")}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-charcoal-light">
                    <span>{event.date} | {event.price === 0 ? t("admin.free") : formatPrice(event.price, event.currency, locale)}</span>
                    <span>{event.slug}</span>
                    {c && (
                      <>
                        <span>{t("admin.registrations_count").replace("{count}", String(c.registrations))}</span>
                        {c.waiting > 0 && (
                          <span>{t("admin.waiting_count").replace("{count}", String(c.waiting))}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {/*
                  Each button names the event it acts on, not just the verb.
                  These are icon-only and there are three of them per card down
                  a long list, so "Edit" on its own would be announced
                  identically a dozen times over with nothing to tell them
                  apart — and the row that carries the waiting-list button is
                  not the same shape as the rows that do not, so position is no
                  help either.
                */}
                <div className="flex gap-2">
                  {c && c.waiting > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${t("admin.view_waiting_list")}: ${event.title_ro}`}
                      onClick={() => setWaitingFor(event)}
                    >
                      <Users className="h-4 w-4 text-warning" aria-hidden="true" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${t("admin.edit_event")}: ${event.title_ro}`}
                    onClick={() => setEditing(event)}
                  >
                    <Edit2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${t("admin.delete")}: ${event.title_ro}`}
                    onClick={() => handleDelete(event)}
                  >
                    <Trash2 className="h-4 w-4 text-error" aria-hidden="true" />
                  </Button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
