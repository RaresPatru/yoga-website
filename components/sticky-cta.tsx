"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function StickyCta() {
  const locale = useLocale();
  const [hasOpenEvents, setHasOpenEvents] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const today = new Date().toISOString().split("T")[0];

    supabase
      .from("events")
      .select("id, max_participants")
      .eq("published", true)
      .gte("date", today)
      .limit(1)
      .then(async ({ data }) => {
        if (!data || data.length === 0) return;
        const event = data[0];
        if (event.max_participants == null) {
          setHasOpenEvents(true);
          return;
        }
        const { count } = await supabase
          .from("registrations")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id)
          .neq("payment_status", "pending");
        setHasOpenEvents((count || 0) < event.max_participants);
      });
  }, []);

  if (!hasOpenEvents) return null;

  const text = locale === "ro" ? "Înscrie-te acum" : "Book now";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-sage/20 bg-white/90 px-4 py-3 shadow-lg backdrop-blur-md lg:hidden">
      <Button
        className="w-full"
        size="lg"
        onClick={() => {
          document.getElementById("events")?.scrollIntoView({ behavior: "smooth" });
        }}
      >
        {text}
      </Button>
    </div>
  );
}
