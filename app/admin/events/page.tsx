"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Edit2, Trash2, Users, X } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";

interface Event {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  description_ro: string | null;
  description_en: string | null;
  date: string;
  time: string;
  location: string | null;
  price: number;
  max_participants: number | null;
  image_url: string | null;
  whatsapp_group_link: string | null;
  published: boolean;
}

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <GlassCard hover={false} className="w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg text-charcoal">{t("admin.waiting_list")}</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-sage/10">
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
    </div>
  );
}

function EventForm({
  event,
  onSave,
  onCancel,
}: {
  event?: Event | null;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useAdminLocale();
  const [form, setForm] = useState({
    slug: event?.slug || "",
    title_ro: event?.title_ro || "",
    title_en: event?.title_en || "",
    description_ro: event?.description_ro || "",
    description_en: event?.description_en || "",
    date: event?.date || "",
    time: event?.time || "",
    location: event?.location || "",
    price: event?.price?.toString() || "0",
    max_participants: event?.max_participants?.toString() || "",
    image_url: event?.image_url || "",
    whatsapp_group_link: event?.whatsapp_group_link || "",
    published: event?.published || false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      id: event?.id,
      ...form,
      price: parseInt(form.price) || 0,
      max_participants: form.max_participants ? parseInt(form.max_participants) : null,
    });
    setSaving(false);
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
        <Input label={t("admin.title_ro")} value={form.title_ro} onChange={(e) => setForm({...form, title_ro: e.target.value})} />
        <Input label={t("admin.title_en")} value={form.title_en} onChange={(e) => setForm({...form, title_en: e.target.value})} />
      </div>

      <Input label={t("admin.slug")} value={form.slug} onChange={(e) => setForm({...form, slug: e.target.value})} placeholder="nume-eveniment" />

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-charcoal-light">{t("admin.description_ro")}</label>
          <textarea
            value={form.description_ro}
            onChange={(e) => setForm({...form, description_ro: e.target.value})}
            rows={4}
            className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal placeholder:text-charcoal-light/50 backdrop-blur-sm focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-charcoal-light">{t("admin.description_en")}</label>
          <textarea
            value={form.description_en}
            onChange={(e) => setForm({...form, description_en: e.target.value})}
            rows={4}
            className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal placeholder:text-charcoal-light/50 backdrop-blur-sm focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Input label={t("admin.date")} type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} />
        <Input label={t("admin.time")} type="time" value={form.time} onChange={(e) => setForm({...form, time: e.target.value})} />
        <Input label={t("admin.location")} value={form.location} onChange={(e) => setForm({...form, location: e.target.value})} />
        <Input label={t("admin.price")} type="number" value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Input label={t("admin.max_participants")} type="number" value={form.max_participants} onChange={(e) => setForm({...form, max_participants: e.target.value})} />
        <Input label={t("admin.image_url")} value={form.image_url} onChange={(e) => setForm({...form, image_url: e.target.value})} />
        <Input label={t("admin.whatsapp_link")} value={form.whatsapp_group_link} onChange={(e) => setForm({...form, whatsapp_group_link: e.target.value})} />
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={form.published}
          onChange={(e) => setForm({...form, published: e.target.checked})}
          className="h-4 w-4 rounded border-sage/30 text-rose focus:ring-rose/20"
        />
        <span className="text-sm text-charcoal-light">{t("admin.published")}</span>
      </label>
    </div>
  );
}

export default function AdminEventsPage() {
  const { t } = useAdminLocale();
  const [events, setEvents] = useState<Event[]>([]);
  const [editing, setEditing] = useState<Event | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, { registrations: number; waiting: number }>>({});
  const [waitingFor, setWaitingFor] = useState<Event | null>(null);

  const loadEvents = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("events")
      .select("*")
      .order("date", { ascending: false });
    if (data) {
      setEvents(data);

      const ids = data.map((e) => e.id);

      const { data: regCounts } = await supabase
        .from("registrations")
        .select("event_id")
        .in("event_id", ids);

      const { data: waitCounts } = await supabase
        .from("waiting_list")
        .select("event_id")
        .in("event_id", ids);

      const regMap: Record<string, number> = {};
      const waitMap: Record<string, number> = {};
      for (const r of regCounts || []) {
        regMap[r.event_id] = (regMap[r.event_id] || 0) + 1;
      }
      for (const w of waitCounts || []) {
        waitMap[w.event_id] = (waitMap[w.event_id] || 0) + 1;
      }

      const merged: Record<string, { registrations: number; waiting: number }> = {};
      for (const id of ids) {
        merged[id] = {
          registrations: regMap[id] || 0,
          waiting: waitMap[id] || 0,
        };
      }
      setCounts(merged);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleSave = async (data: any) => {
    const supabase = createClient();
    if (data.id) {
      await supabase.from("events").update(data).eq("id", data.id);
    } else {
      await supabase.from("events").insert(data);
    }
    setEditing(null);
    setCreating(false);
    loadEvents();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("admin.confirm_delete_event"))) return;
    const supabase = createClient();
    await supabase.from("events").delete().eq("id", id);
    loadEvents();
  };

  if (creating || editing) {
    return <EventForm event={editing} onSave={handleSave} onCancel={() => { setCreating(false); setEditing(null); }} />;
  }

  return (
    <div>
      {waitingFor && (
        <WaitingListModal event={waitingFor} onClose={() => setWaitingFor(null)} />
      )}

      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl text-charcoal">{t("admin.events")}</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> {t("admin.new_event")}
        </Button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      ) : events.length === 0 ? (
        <p className="mt-8 text-charcoal-light">{t("admin.no_events")}</p>
      ) : (
        <div className="mt-6 space-y-3">
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
                    <span>{event.date} | {event.price === 0 ? t("admin.free") : `${event.price} RON`}</span>
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
                <div className="flex gap-2">
                  {c && c.waiting > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setWaitingFor(event)}>
                      <Users className="h-4 w-4 text-warning" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(event)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(event.id)}>
                    <Trash2 className="h-4 w-4 text-error" />
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
