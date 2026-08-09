import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { getLocale } from "next-intl/server";
import { SITE_NAME, siteUrl } from "@/lib/site-config";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
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
    <html lang={locale} suppressHydrationWarning className={`${fraunces.variable} ${inter.variable}`}>
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
