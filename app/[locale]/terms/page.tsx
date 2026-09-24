import type { Metadata } from "next";
import { LegalDocument, legalMetadata } from "@/components/legal/legal-document";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return legalMetadata("terms", (await params).locale);
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <LegalDocument kind="terms" locale={(await params).locale} />;
}
