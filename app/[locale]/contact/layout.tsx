import { buildPageMetadata } from "@/lib/metadata";
import { absoluteUrl, SITE_NAME } from "@/lib/site-config";
import type { Metadata } from "next";

/**
 * Exists only to give the contact page its own metadata.
 *
 * The page itself is a client component — it needs state for the form and the
 * CAPTCHA — and `generateMetadata` can only be exported from a server
 * component. A layout is the standard way round that: it wraps the page, runs
 * on the server, and its metadata overrides the locale layout's default. The
 * alternative would be splitting the form into an island purely for the sake of
 * a title, which is not worth it for a page with no content to index.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return buildPageMetadata({
    title: `Contact · ${SITE_NAME}`,
    description:
      locale === "ro"
        ? "Scrie-mi pentru colaborări, întrebări despre ateliere sau rezervări private."
        : "Get in touch about collaborations, workshop questions or private sessions.",
    path: "/contact",
    locale,
    image: absoluteUrl(`/api/og/default?locale=${locale}`),
  });
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
