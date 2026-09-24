import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/lib/button-styles";
import { GlassCard } from "@/components/ui/glass-card";
import { TextPlaceholder, ImagePlaceholder } from "@/components/ui/content-placeholder";
import { contentText, getSiteContent, placeholderName } from "@/lib/site-content";
import type { SiteContentKey } from "@/lib/site-content-schema";
import { sanitizeHtml } from "@/lib/sanitize";
import { buildPageMetadata, toDescription } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";

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

// Inert today — every route in this app is server-rendered on demand — and kept
// as a ceiling in case that changes. The reasoning is on the same line in
// app/[locale]/page.tsx.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const content = await getSiteContent(locale);

  const title = contentText(content, "about.title", locale) ?? "";

  // Her story's first lines, or no description at all: the fallback sentence
  // this used to have was written for her, not by her.
  const description = toDescription(content["about.body"], "");

  return buildPageMetadata({
    title,
    description: description || null,
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
  const text = (key: SiteContentKey) => contentText(content, key, locale) ?? "";
  const title = text("about.title");
  const personName = content["seo.person_name"];

  // schema.org Person, tying the site to a named human, and only when she has
  // said what her name is ("Conținut site" → "SEO și firmă"). It used to
  // carry a placeholder name and a job title nobody had supplied (audit R6).
  const personSchema = personName
    ? {
        "@context": "https://schema.org",
        "@type": "Person",
        name: personName,
        url: absoluteUrl(`/${locale}/about`),
        ...(content["about.body"] ? { description: toDescription(content["about.body"], "") } : {}),
        ...(content["about.portrait"] ? { image: content["about.portrait"] } : {}),
      }
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {personSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
        />
      )}

      <div className="grid gap-10 md:grid-cols-5 md:gap-14">
        <div className="md:col-span-2">
          <div className="md:sticky md:top-24">
            {content["about.portrait"] ? (
              <div className="relative aspect-[3/4] overflow-hidden rounded-3xl shadow-xl">
                <Image
                  src={content["about.portrait"]}
                  alt={content["about.portrait_alt"] ?? personName ?? ""}
                  fill
                  sizes="(max-width: 768px) 90vw, 40vw"
                  className="object-cover"
                  priority
                />
              </div>
            ) : (
              <ImagePlaceholder label={placeholderName("about.portrait", locale)} />
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
              <TextPlaceholder label={placeholderName("about.body", locale)} />
            </div>
          )}

          {content["about.credentials"] && (
            <GlassCard hover={false} className="mt-10">
              <h2 className="font-serif text-xl text-charcoal">
                {text("about.credentials_title")}
              </h2>
              <div
                className="prose prose-sage mt-4 max-w-none text-charcoal-light"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(content["about.credentials"]) }}
              />
            </GlassCard>
          )}

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/events" className={buttonClasses({ size: "lg" })}>
                {text("about.button_primary")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            <Link href="/contact" className={buttonClasses({ variant: "secondary", size: "lg" })}>{text("about.button_secondary")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
