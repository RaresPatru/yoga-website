import type { Metadata } from "next";
import { LegalDocument, legalMetadata } from "@/components/legal/legal-document";
import { PageTransition } from "@/components/layout/view-transitions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return legalMetadata("privacy", (await params).locale);
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <PageTransition>
      <LegalDocument kind="privacy" locale={(await params).locale} />
    </PageTransition>
  );
}
