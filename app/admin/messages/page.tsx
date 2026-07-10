"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  created_at: string;
}

export default function AdminContactMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setMessages(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Sigur dorești să ștergi acest mesaj?")) return;
    const supabase = createClient();
    await supabase.from("contact_messages").delete().eq("id", id);
    load();
  };

  return (
    <div>
      <h1 className="font-serif text-2xl text-charcoal">Mesaje Contact</h1>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      ) : messages.length === 0 ? (
        <p className="mt-6 text-charcoal-light">Nu există mesaje.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {messages.map((m) => (
            <GlassCard key={m.id} hover={false}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-charcoal">{m.name}</p>
                  <p className="text-sm text-charcoal-light">{m.email} · {new Date(m.created_at).toLocaleString("ro-RO")}</p>
                  {m.subject && <p className="mt-1 text-sm font-medium text-charcoal">{m.subject}</p>}
                  <p className="mt-2 text-charcoal">{m.message}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(m.id)}>
                  <Trash2 className="h-4 w-4 text-error" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
