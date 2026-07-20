"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Calendar, Users, FileText, Star } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";

export default function AdminDashboard() {
  const { t } = useAdminLocale();
  const [stats, setStats] = useState({
    events: 0,
    registrations: 0,
    posts: 0,
    pendingTestimonials: 0,
  });

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("events").select("*", { count: "exact", head: true }),
      supabase.from("registrations").select("*", { count: "exact", head: true }),
      supabase.from("blog_posts").select("*", { count: "exact", head: true }),
      supabase
        .from("testimonials")
        .select("*", { count: "exact", head: true })
        .eq("approved", false),
    ]).then(
      ([events, registrations, posts, testimonials]) => {
        setStats({
          events: events.count ?? 0,
          registrations: registrations.count ?? 0,
          posts: posts.count ?? 0,
          pendingTestimonials: testimonials.count ?? 0,
        });
      }
    );
  }, []);

  const cards = [
    { icon: Calendar, labelKey: "admin.events", value: stats.events, color: "text-sage" },
    { icon: Users, labelKey: "admin.registrations", value: stats.registrations, color: "text-rose" },
    { icon: FileText, labelKey: "admin.blog", value: stats.posts, color: "text-lavender" },
    { icon: Star, labelKey: "admin.pending_testimonials", value: stats.pendingTestimonials, color: "text-rose" },
  ];

  return (
    <div>
      <h1 className="font-serif text-2xl text-charcoal">{t("admin.dashboard_title")}</h1>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <GlassCard key={card.labelKey} hover={false}>
            <div className="flex items-center gap-4">
              <card.icon className={`h-8 w-8 ${card.color}`} />
              <div>
                <p className="text-2xl font-semibold text-charcoal">
                  {card.value}
                </p>
                <p className="text-sm text-charcoal-light">{t(card.labelKey)}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
