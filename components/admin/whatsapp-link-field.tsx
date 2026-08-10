"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookmarkPlus, Check, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

interface WhatsappLink {
  id: string;
  label: string;
  url: string;
  is_default: boolean;
}

/**
 * The WhatsApp group link on the event form, plus a small library of links she
 * has used before.
 *
 * WHY THIS EXISTS
 *
 * It was a bare text box, and the same 60-character invite URL was being pasted
 * into it for every event. That is a typo waiting to happen, and it is a
 * particularly expensive typo: the link goes out in the confirmation email to
 * people who have just paid, so the first person to notice it is broken is a
 * customer.
 *
 * WHY THE EVENT STILL STORES THE URL ITSELF
 *
 * Choosing a saved link *copies* it onto the event rather than pointing at a
 * row in this table. Deleting a link here, or editing it because the group
 * moved, therefore cannot retroactively change what an event says — including
 * events whose attendees were emailed the old link weeks ago. The library is a
 * convenience for filling in a field, not the record of what someone was told.
 * The migration explains the same reasoning from the database side.
 */
export function WhatsappLinkField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const { t } = useAdminLocale();
  const [links, setLinks] = useState<WhatsappLink[]>([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("whatsapp_links")
      .select("id, label, url, is_default")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    return data ?? [];
  }, []);

  // `cancelled` because the event form can be closed while this request is in
  // flight, and setting state on a component that has gone is both a warning
  // and a small leak.
  useEffect(() => {
    let cancelled = false;
    load().then((rows) => {
      if (!cancelled) setLinks(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // <dialog> rather than a hand-rolled overlay: it brings the focus trap, the
  // Escape handling and the inert backdrop with it, all of which are easy to
  // get subtly wrong by hand.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const onClose = () => setOpen(false);
    dialog?.addEventListener("close", onClose);
    return () => dialog?.removeEventListener("close", onClose);
  }, []);

  const saveCurrent = async () => {
    const url = value.trim();
    if (!url || !label.trim()) return;

    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("whatsapp_links")
      .insert({ label: label.trim(), url });

    // Reported rather than swallowed. Row Level Security filters rather than
    // refuses, so a permissions problem here would otherwise look like a save
    // that worked and a list that stayed empty.
    if (insertError) setError(insertError.message);
    else {
      setLabel("");
      setLinks(await load());
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    if (!confirm(t("admin.confirm_delete_link"))) return;
    setBusy(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("whatsapp_links").delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
    else setLinks(await load());
    setBusy(false);
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor="event-whatsapp" className="text-sm font-medium text-charcoal-light">
        {t("admin.whatsapp_link")}
      </label>

      <div className="flex gap-2">
        <input
          id="event-whatsapp"
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://chat.whatsapp.com/…"
          className="min-w-0 flex-1 rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal placeholder:text-charcoal-light/50 backdrop-blur-sm focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20"
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("admin.manage_saved_links")}
          title={t("admin.manage_saved_links")}
          className="shrink-0 rounded-xl border border-sage/30 bg-white/60 px-3 text-charcoal-light backdrop-blur-sm transition-colors hover:border-rose/30 hover:text-rose"
        >
          <BookmarkPlus className="h-4 w-4" />
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="m-auto max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg rounded-2xl bg-transparent p-0 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <GlassCard hover={false} className="max-h-[80vh] overflow-y-auto">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-lg text-charcoal">{t("admin.saved_links")}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("admin.close")}
              className="rounded-full p-1 hover:bg-sage/10"
            >
              <X className="h-5 w-5 text-charcoal-light" />
            </button>
          </div>

          <p className="mb-4 text-sm text-charcoal-light">{t("admin.saved_links_hint")}</p>

          {links.length === 0 ? (
            <p className="py-6 text-center text-sm text-charcoal-light">
              {t("admin.no_saved_links")}
            </p>
          ) : (
            <ul className="mb-6 space-y-2">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="flex items-center gap-2 rounded-xl border border-sage/20 bg-white/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-charcoal">{link.label}</p>
                    <p className="truncate text-xs text-charcoal-light">{link.url}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(link.url);
                      setOpen(false);
                    }}
                    className="shrink-0 rounded-lg bg-sage/15 px-3 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-sage/25"
                  >
                    <Check className="mr-1 inline h-3.5 w-3.5" />
                    {t("admin.use_link")}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(link.id)}
                    disabled={busy}
                    aria-label={`${t("admin.delete_link")}: ${link.label}`}
                    className="shrink-0 rounded-lg p-1.5 text-charcoal-light transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/*
            Saves whatever is currently in the field rather than offering a
            second URL box. Adding a link she is not using right now is a case
            that has never come up; saving the one she just pasted is the whole
            point.
          */}
          <div className="border-t border-sage/20 pt-4">
            <label
              htmlFor="whatsapp-link-label"
              className="text-sm font-medium text-charcoal-light"
            >
              {t("admin.link_label")}
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="whatsapp-link-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("admin.link_label_placeholder")}
                className="min-w-0 flex-1 rounded-xl border border-sage/30 bg-white/60 px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-light/50 focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20"
              />
              <Button
                type="button"
                onClick={saveCurrent}
                disabled={busy || !value.trim() || !label.trim()}
              >
                {t("admin.save_link")}
              </Button>
            </div>
            <p className="mt-1.5 truncate text-xs text-charcoal-light">
              {value.trim() || "—"}
            </p>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm text-error">
              {error}
            </p>
          )}
        </GlassCard>
      </dialog>
    </div>
  );
}
