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
        // No cap means there is always room.
        if (event.max_participants == null) {
          setHasOpenEvents(true);
          return;
        }
        // Aggregate view — see the event detail page for why the registrations
        // table cannot be counted from the browser.
        const { data: availability } = await supabase
          .from("event_availability")
          .select("taken")
          .eq("event_id", event.id)
          .single();
        setHasOpenEvents((availability?.taken ?? 0) < event.max_participants);
      });
  }, []);

  if (!hasOpenEvents) return null;

  const text = locale === "ro" ? "Înscrie-te acum" : "Book now";

  return (
    <>
      {/*
       * A spacer the same height as the fixed bar.
       *
       * The bar is position:fixed, so it sits outside the document flow and
       * covers whatever is at the bottom of the page — in practice the footer,
       * with its contact and social links. Rendering a matching spacer here
       * gives the page something to scroll past. Doing it inside this component
       * rather than as page padding keeps the two in step: the bar only appears
       * when seats are available, and so does the space it needs.
       */}
      <div aria-hidden="true" className="h-20 lg:hidden" />

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
    </>
  );
}
