"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatTime } from "@/lib/utils";
import { StickyCta } from "@/components/sticky-cta";
import { ArrowRight, Calendar, Clock, Star, Users } from "lucide-react";

interface Post {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  created_at: string;
}

interface Event {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  date: string;
  time: string;
  price: number;
  max_participants: number | null;
  registration_count: number;
}

interface Testimonial {
  id: string;
  content: string;
}

export default function HomePage() {
  const t = useTranslations("home");
  const [locale, setLocale] = useState("ro");
  const [posts, setPosts] = useState<Post[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  useEffect(() => {
    setLocale(document.documentElement.lang || "ro");
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const today = new Date().toISOString().split("T")[0];

    supabase
      .from("blog_posts")
      .select("id, slug, title_ro, title_en, created_at")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => { if (data) setPosts(data); });

    supabase
      .from("events")
      .select("id, slug, title_ro, title_en, date, time, price, max_participants, registration_count")
      .eq("published", true)
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(3)
      .then(({ data }) => { if (data) setEvents(data); });

    supabase
      .from("testimonials")
      .select("id, content")
      .eq("approved", true)
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data }) => { if (data) setTestimonials(data); });
  }, []);

  const lt = (ro: string, en: string) => locale === "ro" ? ro : en;

  return (
    <div className="flex flex-col">
      <section className="relative min-h-[90vh] flex items-center overflow-hidden px-4">
        <div className="mx-auto grid w-full max-w-7xl gap-8 md:grid-cols-2 md:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative aspect-[3/4] w-full max-w-lg mx-auto md:mx-0 rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-sage/20 to-lavender/20" />
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-sage/10 to-lavender/10">
              <span className="font-serif text-6xl text-sage/30">✧</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="text-center md:text-left"
          >
            <h1 className="font-serif text-4xl leading-tight text-charcoal md:text-6xl">
              {t("hero_title")}
            </h1>
            <p className="mt-4 text-lg text-charcoal-light md:text-xl">
              {t("hero_subtitle")}
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center justify-center md:justify-start">
              <Link href="/events">
                <Button size="lg">{t("cta")}</Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="bg-white/40 py-20 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h2 className="font-serif text-3xl text-charcoal md:text-4xl">
              {t("mission_title")}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-charcoal-light">
              {t("mission_text")}
            </p>
          </motion.div>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              { value: "10+", label: t("years_label") },
              { value: "500+", label: t("classes_label") },
              { value: "1000+", label: t("students_label") },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <GlassCard className="text-center">
                  <p className="font-serif text-4xl text-rose">{stat.value}</p>
                  <p className="mt-2 text-sm text-charcoal-light">{stat.label}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {posts.length > 0 && (
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
              {t("blog_title")}
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {posts.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <GlassCard className="h-full transition-transform hover:scale-[1.02]">
                    <h3 className="font-serif text-lg text-charcoal">
                      {lt(post.title_ro, post.title_en || post.title_ro)}
                    </h3>
                    <p className="mt-2 text-sm text-charcoal-light">
                      {formatDate(post.created_at, locale)}
                    </p>
                  </GlassCard>
                </Link>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link href="/blog">
                <Button variant="secondary">
                  {lt("Vezi toate articolele", "View all posts")} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section id="events" className="bg-white/40 py-20 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
              {t("events_title")}
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {events.map((event) => {
                const isFull = event.max_participants != null && (event.registration_count || 0) >= event.max_participants;
                return (
                <Link key={event.id} href={`/events/${event.slug}`}>
                  <GlassCard className="h-full transition-transform hover:scale-[1.02]">
                    <h3 className="font-serif text-lg text-charcoal">
                      {lt(event.title_ro, event.title_en || event.title_ro)}
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-charcoal-light">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" /> {formatDate(event.date, locale)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {formatTime(event.time)}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="rounded-full bg-rose/10 px-3 py-1 text-sm font-medium text-rose">
                        {event.price === 0 ? "Gratuit" : `${event.price} RON`}
                      </span>
                      {event.max_participants && (
                        <span className={`flex items-center gap-1 text-xs ${isFull ? "text-error" : "text-charcoal-light"}`}>
                          <Users className="h-3 w-3" />
                          {isFull ? "Complet" : `${event.registration_count || 0}/${event.max_participants}`}
                        </span>
                      )}
                    </div>
                  </GlassCard>
                </Link>
                );
              })}
            </div>
            <div className="mt-8 text-center">
              <Link href="/events">
                <Button variant="secondary">
                  {lt("Vezi toate evenimentele", "View all events")} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {testimonials.length > 0 && (
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
              {t("testimonials_title")}
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((t) => (
                <GlassCard key={t.id}>
                  <div className="mb-3 flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-rose text-rose" />
                    ))}
                  </div>
                  <p className="text-charcoal">&ldquo;{t.content}&rdquo;</p>
                </GlassCard>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link href="/testimonials">
                <Button variant="secondary">
                  {lt("Vezi toate testimonialele", "View all testimonials")} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}
      <StickyCta />
    </div>
  );
}
