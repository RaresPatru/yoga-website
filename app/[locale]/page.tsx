"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Link } from "@/i18n/navigation";

export default function HomePage() {
  const t = useTranslations("home");

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

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
            {t("blog_title")}
          </h2>
          <p className="mt-2 text-center text-charcoal-light">
            Blog posts coming soon...
          </p>
        </div>
      </section>

      <section className="bg-white/40 py-20 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
            {t("events_title")}
          </h2>
          <p className="mt-2 text-center text-charcoal-light">
            Evenimente disponibile în curând...
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
            {t("testimonials_title")}
          </h2>
          <p className="mt-2 text-center text-charcoal-light">
            Testimonialele apar după primele evenimente...
          </p>
        </div>
      </section>
    </div>
  );
}
