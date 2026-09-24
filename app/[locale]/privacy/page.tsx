import type { Metadata } from "next";
import { LegalDocument, legalMetadata } from "@/components/legal/legal-document";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return legalMetadata("privacy", (await params).locale);
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <LegalDocument kind="privacy" locale={(await params).locale} />;
}
