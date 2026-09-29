import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { buildPageMetadata } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";
import { pageFrom } from "@/lib/blog";
import { buttonClasses } from "@/lib/button-styles";
import { Pagination } from "@/components/ui/pagination";
import {
  PUBLIC_TESTIMONIAL_COLUMNS,
  TestimonialCard,
  type PublicTestimonial,
} from "@/components/testimonials/testimonial-card";
import { PageTransition } from "@/components/layout/view-transitions";

/** Twelve fills one, two or three columns evenly, as on the blog and the events archive. */
const PER_PAGE = 12;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const page = pageFrom((await searchParams).page);
  const t = await getTranslations({ locale, namespace: "testimonials" });
  return buildPageMetadata({
    title: page > 1 ? t("page_title", { page }) : t("title"),
    description:
      locale === "ro"
        ? "Ce spun participanții despre evenimente, scris de ei, după ce au fost acolo."
        : "What participants say about the events, written by them after they were there.",
    // Each page of the list is its own address, so its own canonical URL.
    path: page > 1 ? `/testimonials?page=${page}` : "/testimonials",
    locale,
    image: absoluteUrl(`/api/og/default?locale=${locale}`),
  });
}

/**
 * Every testimonial she has approved and not hidden, newest first, twelve to
 * a page with the page number in the address. The read policy decides which
 * rows a visitor sees, so the query asks only for the page.
 *
 * Under the heading, how testimonials are checked, which the EU's Omnibus
 * rules ask any site showing reviews to say, and the way to write one.
 */
export default async function TestimonialsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "testimonials" });
  const tp = await getTranslations({ locale, namespace: "pagination" });
  const page = pageFrom((await searchParams).page);
  const from = (page - 1) * PER_PAGE;

  const { data, count } = await createPublicClient()
    .from("testimonials")
    .select(PUBLIC_TESTIMONIAL_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PER_PAGE - 1);

  const testimonials = (data ?? []) as unknown as PublicTestimonial[];
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));
  // A page past the end of the list is a missing page, not an empty one.
  if (page > pageCount) notFound();

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="max-w-2xl">
            <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>
            <p className="mt-2 text-charcoal-light">{t("subtitle")}</p>
          </div>
          <Link href="/testimonials/share" className={buttonClasses({ variant: "secondary" })}>
            {t("share")}
          </Link>
        </div>
        <p className="mt-4 max-w-2xl text-sm text-charcoal-light">{t("how_we_check")}</p>

        {!testimonials.length ? (
          <p className="mt-8 text-charcoal-light">{t("no_testimonials")}</p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((item) => (
              <TestimonialCard key={item.id} item={item} locale={locale} />
            ))}
          </div>
        )}

        <Pagination
          className="mt-10"
          page={page}
          pageCount={pageCount}
          href={(p) => (p === 1 ? `/${locale}/testimonials` : `/${locale}/testimonials?page=${p}`)}
          labels={{
            label: tp("label"),
            previous: tp("previous"),
            next: tp("next"),
            page: (p) => tp("page", { page: p }),
          }}
        />
      </div>
    </PageTransition>
  );
}
