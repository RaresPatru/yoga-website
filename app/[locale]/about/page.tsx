import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/lib/button-styles";
import { GlassCard } from "@/components/ui/glass-card";
import { TextPlaceholder, ImagePlaceholder } from "@/components/ui/content-placeholder";
import { getSiteContent } from "@/lib/site-content";
import { sanitizeHtml } from "@/lib/sanitize";
import { buildPageMetadata, toDescription } from "@/lib/metadata";
import { absoluteUrl, SITE_NAME, INSTRUCTOR_NAME } from "@/lib/site-config";

/**
 * About page.
 *
 * Listed as an open item in the original plan and never built, which left the
 * site without the page that research consistently identifies as the most
 * important on a solo instructor's site. People choosing a yoga teacher are
 * choosing a person: her training, why she teaches, what a session with her
 * feels like. Without it, a visitor arriving from Instagram has nothing to go
 * on but a booking form.
 *
 * Every word here comes from the database so she can write and revise it
 * herself — see supabase/migrations/20260808000001_site_content.sql.
 */

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const content = await getSiteContent(locale);

  const title = content["about.title"] ?? (locale === "ro" ? "Despre mine" : "About me");

  return buildPageMetadata({
    title: `${title} · ${SITE_NAME}`,
    description: toDescription(
      content["about.body"],
      locale === "ro"
        ? "Povestea din spatele practicii: formare, experiență și felul în care lucrez."
        : "The story behind the practice: training, experience and how I work."
    ),
    path: "/about",
    locale,
    image: absoluteUrl(`/api/og/default?locale=${locale}`),
  });
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const content = await getSiteContent(locale);
  const ro = locale === "ro";

  const title = content["about.title"] ?? (ro ? "Despre mine" : "About me");

  // schema.org Person, tying the site to a named human. Combined with the
  // LocalBusiness data in the layout, this is what lets search engines model
  // "this business is run by this person".
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: INSTRUCTOR_NAME,
    jobTitle: ro ? "Instructor de yoga" : "Yoga instructor",
    description: toDescription(content["about.body"], title),
    url: absoluteUrl(`/${locale}/about`),
    ...(content["about.portrait"] ? { image: content["about.portrait"] } : {}),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />

      <div className="grid gap-10 md:grid-cols-5 md:gap-14">
        <div className="md:col-span-2">
          <div className="md:sticky md:top-24">
            {content["about.portrait"] ? (
              <div className="relative aspect-[3/4] overflow-hidden rounded-3xl shadow-xl">
                <Image
                  src={content["about.portrait"]}
                  alt={INSTRUCTOR_NAME}
                  fill
                  sizes="(max-width: 768px) 90vw, 40vw"
                  className="object-cover"
                  priority
                />
              </div>
            ) : (
              <ImagePlaceholder label="Portretul tău — adaugă din panoul de administrare" />
            )}
          </div>
        </div>

        <div className="md:col-span-3">
          <h1 className="font-serif text-4xl text-charcoal md:text-5xl">{title}</h1>

          {content["about.body"] ? (
            <div
              className="prose prose-sage mt-6 max-w-none text-charcoal-light"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(content["about.body"]) }}
            />
          ) : (
            <div className="mt-6">
              <TextPlaceholder label="Povestea ta — cum ai ajuns la yoga, ce te-a format, cum lucrezi" />
            </div>
          )}

          {content["about.credentials"] && (
            <GlassCard hover={false} className="mt-10">
              <h2 className="font-serif text-xl text-charcoal">
                {ro ? "Formare și certificări" : "Training and certifications"}
              </h2>
              <div
                className="prose prose-sage mt-4 max-w-none text-charcoal-light"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(content["about.credentials"]) }}
              />
            </GlassCard>
          )}

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/events" className={buttonClasses({ size: "lg" })}>
                {ro ? "Vezi evenimentele" : "See the events"}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            <Link href="/contact" className={buttonClasses({ variant: "secondary", size: "lg" })}>{ro ? "Scrie-mi" : "Get in touch"}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
