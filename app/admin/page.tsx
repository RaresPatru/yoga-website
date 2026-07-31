"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Calendar, Users, FileText, Star, Mail } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";

interface StatCard {
  icon: typeof Calendar;
  labelKey: string;
  value: number;
  color: string;
  href: string;
}

export default function AdminDashboard() {
  const { t } = useAdminLocale();
  const [stats, setStats] = useState({
    events: 0,
    registrations: 0,
    posts: 0,
    pendingTestimonials: 0,
    messages: 0,
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
      supabase.from("contact_messages").select("*", { count: "exact", head: true }),
    ]).then(
      ([events, registrations, posts, testimonials, messages]) => {
        setStats({
          events: events.count ?? 0,
          registrations: registrations.count ?? 0,
          posts: posts.count ?? 0,
          pendingTestimonials: testimonials.count ?? 0,
          messages: messages.count ?? 0,
        });
      }
    );
  }, []);

  const cards: StatCard[] = [
    { icon: Calendar, labelKey: "admin.events", value: stats.events, color: "text-sage", href: "/admin/events" },
    { icon: Users, labelKey: "admin.registrations", value: stats.registrations, color: "text-rose", href: "/admin/registrations" },
    { icon: FileText, labelKey: "admin.blog", value: stats.posts, color: "text-lavender", href: "/admin/blog" },
    { icon: Mail, labelKey: "admin.messages", value: stats.messages, color: "text-blush", href: "/admin/messages" },
    { icon: Star, labelKey: "admin.pending_testimonials", value: stats.pendingTestimonials, color: "text-rose-dark", href: "/admin/testimonials" },
  ];

  return (
    <div>
      <h1 className="font-serif text-2xl text-charcoal">{t("admin.dashboard_title")}</h1>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Link key={card.labelKey} href={card.href} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 rounded-2xl">
            <GlassCard hover>
              <div className="flex items-center gap-4">
                <card.icon className={`h-8 w-8 transition-transform duration-300 group-hover:scale-110 ${card.color}`} />
                <div>
                  <p className="text-2xl font-semibold text-charcoal">
                    {card.value}
                  </p>
                  <p className="text-sm text-charcoal-light">{t(card.labelKey)}</p>
                </div>
              </div>
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
