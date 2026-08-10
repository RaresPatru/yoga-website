import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { getLocale } from "next-intl/server";
import { SITE_NAME, siteUrl } from "@/lib/site-config";
import "./globals.css";

/**
 * The two typefaces, self-hosted by next/font.
 *
 * `latin-ext` matters here and is easy to miss. Romanian's ă, â, î, ș and ț
 * live in Latin Extended-A/B, not in the base `latin` subset — so loading only
 * `latin` means the browser silently substitutes a fallback font for exactly
 * those five letters. In a serif heading next to Playfair's own glyphs the
 * mismatch is visible, and Romanian is the primary language of this site.
 *
 * next/font downloads these at build time and serves them from our own origin,
 * so there is no request to fonts.googleapis.com at runtime and nothing to
 * allow in the Content Security Policy.
 *
 * The variables are named after the typeface rather than after its role, and
 * globals.css maps `--font-serif` onto `--font-playfair`. Naming both of them
 * `--font-serif` looks tidier and is a trap: the Tailwind theme would then
 * declare the family a second time, by name, and the two declarations can drift
 * apart — leaving the site asking for a font the visitor's machine has to
 * happen to own. One source, one place to change it.
 */
const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Root-level defaults only. Every localised page supplies its own title,
 * description and share image via generateMetadata — see lib/metadata.ts.
 * `metadataBase` is what lets those pages give relative image paths and still
 * emit the absolute URLs that crawlers require.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: SITE_NAME,
  description: "Yoga pentru corp, minte și suflet",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /**
   * The document language, resolved on the server.
   *
   * This was hardcoded to "ro" and corrected in the browser afterwards by an
   * effect. That meant every server-rendered English page declared itself as
   * Romanian in exactly the markup that search engines and screen readers
   * consume — and screen readers pick a pronunciation from this attribute, so
   * English content was being read aloud with Romanian phonetics.
   *
   * `getLocale()` reads what the middleware in proxy.ts already worked out from
   * the URL, so no effect and no hydration mismatch. Admin routes are not
   * localised and fall back to the default, which is correct for them.
   */
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning className={`${playfair.variable} ${inter.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        {/*
          No Suspense boundary here any more.

          It used to wrap {children} — the whole application — purely because
          the analytics provider calls useSearchParams(). That made Next flush
          the document shell immediately and stream everything after it, so the
          response status was committed as 200 before any page could call
          notFound(). Missing events answered "200 OK" while showing a 404.

          The boundary now lives inside PostHogProvider, around the tracker that
          actually needs it.
        */}
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
