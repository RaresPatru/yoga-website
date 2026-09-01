import { createPublicClient } from "@/lib/supabase/public";
import { Link } from "@/i18n/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { formatDate, formatTime } from "@/lib/utils";
import { formatPrice } from "@/lib/money";
import { getLocale, getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/metadata";
import { absoluteUrl, SITE_NAME } from "@/lib/site-config";
import { Calendar, Clock, MapPin } from "lucide-react";
import Image from "next/image";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    title: locale === "ro" ? `Evenimente · ${SITE_NAME}` : `Events · ${SITE_NAME}`,
    description:
      locale === "ro"
        ? "Ateliere, retreaturi și sesiuni de yoga în grupuri mici. Vezi datele următoare și rezervă-ți locul."
        : "Workshops, retreats and yoga sessions in small groups. See upcoming dates and book your spot.",
    path: "/events",
    locale,
    image: absoluteUrl(`/api/og/default?locale=${locale}`),
  });
}

export default async function EventsPage() {
  const locale = await getLocale();
  const t = await getTranslations("events");
  const supabase = createPublicClient();

  const today = new Date().toISOString().split("T")[0];

  const { data: events } = await supabase
    .from("events")
    .select("id, slug, title_ro, title_en, date, time, location, price, currency, max_participants, image_url, description_ro, description_en")
    .eq("published", true)
    .gte("date", today)
    .order("date", { ascending: true });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>
      <p className="mt-2 text-charcoal-light">{t("subtitle")}</p>

      {!events?.length ? (
        <p className="mt-8 text-charcoal-light">{t("no_events")}</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <Link key={event.id} href={`/events/${event.slug}`}>
              <GlassCard className="group h-full transition-transform hover:scale-[1.02]">
                {event.image_url && (
                  <div className="relative mb-4 aspect-video w-full overflow-hidden rounded-xl bg-sage/10">
                    <Image
                      src={event.image_url}
                      alt={locale === "ro" ? event.title_ro : (event.title_en || event.title_ro)}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <h2 className="font-serif text-xl text-charcoal">
                  {locale === "ro" ? event.title_ro : (event.title_en || event.title_ro)}
                </h2>
                <p className="mb-4 mt-2 line-clamp-2 text-sm text-charcoal-light">
                  {locale === "ro" ? event.description_ro : (event.description_en || event.description_ro)}
                </p>
                <div className="flex flex-wrap gap-3 text-sm text-charcoal-light">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> {formatDate(event.date, locale)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {formatTime(event.time)}
                  </span>
                  {event.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {event.location}
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <span className="rounded-full bg-rose/10 px-3 py-1 text-sm font-medium text-rose">
                    {event.price === 0 ? t("free") : formatPrice(event.price, event.currency, locale)}
                  </span>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
