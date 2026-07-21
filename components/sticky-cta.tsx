"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function StickyCta() {
  const [hasOpenEvents, setHasOpenEvents] = useState(false);
  const [locale, setLocale] = useState("ro");

  useEffect(() => {
    setLocale(document.documentElement.lang || "ro");
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const today = new Date().toISOString().split("T")[0];

    supabase
      .from("events")
      .select("id, max_participants, registration_count")
      .eq("published", true)
      .gte("date", today)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const event = data[0] as any;
          const isFull = event.max_participants != null && (event.registration_count || 0) >= event.max_participants;
          setHasOpenEvents(!isFull);
        }
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
