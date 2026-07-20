"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { useAdminLocale } from "@/components/admin/locale-provider";

interface Registration {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  payment_status: string;
  created_at: string;
  events: { title_ro: string; date: string; price: number };
}

export default function AdminRegistrationsPage() {
  const { t } = useAdminLocale();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("registrations")
      .select("*, events:event_id(title_ro, date, price)")
      .order("created_at", { ascending: false });
    if (data) setRegistrations(data as unknown as Registration[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = registrations.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()) ||
    r.email.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor: Record<string, string> = {
    free: "bg-sage/10 text-sage",
    completed: "bg-success/10 text-success",
    pending: "bg-warning/10 text-warning",
    refunded: "bg-error/10 text-error",
  };

  const statusLabelKey: Record<string, string> = {
    free: "admin.free",
    completed: "admin.paid",
    pending: "admin.pending",
    refunded: "admin.refunded",
  };

  return (
    <div>
      <h1 className="font-serif text-2xl text-charcoal">{t("admin.registrations")}</h1>
      <Input
        placeholder={t("admin.search_name_email")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-4"
      />

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-charcoal-light">{t("admin.no_registrations")}</p>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((reg) => (
            <GlassCard key={reg.id} hover={false}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-charcoal">{reg.full_name}</p>
                  <p className="text-sm text-charcoal-light">{reg.email} · {reg.phone}</p>
                  <p className="text-sm text-charcoal-light">
                    {reg.events?.title_ro} — {reg.events?.date}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs ${statusColor[reg.payment_status] || "bg-charcoal-light/10 text-charcoal-light"}`}>
                  {t(statusLabelKey[reg.payment_status] || reg.payment_status)}
                </span>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
