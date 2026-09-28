import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { siteHost, type EmailBrand } from "@/lib/email-layout";

/**
 * What every email carries from "Conținut site": the name or logo at the
 * top, the business name and address in the footer, and the address replies
 * go to.
 *
 * Takes a Supabase client rather than making one, so the admin's preview
 * reads it with her session in the browser and the server with its own key,
 * and both draw the same email.
 */

const KEYS = [
  "general.site_name",
  "identity.logo",
  "identity.display",
  "legal.business_name",
  "legal.address",
  "legal.email",
  "email.reply_to",
] as const;

const EMAIL_ADDRESS = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]+$/;

/** An address if it looks like one, else null: a typo must not become a broken Reply-To. */
export function validEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return EMAIL_ADDRESS.test(trimmed) ? trimmed : null;
}

export interface EmailSettings {
  brand: EmailBrand;
  /** Where replies go: her address for emails, else the one for personal data requests. */
  replyTo: string | null;
}

/** A picture's address as an email needs it: absolute, and not an SVG, which Gmail will not draw. */
export function emailImage(src: string | null | undefined, siteUrl: string): string | null {
  if (!src) return null;
  const absolute = src.startsWith("/") && !src.startsWith("//") ? `${siteUrl}${src}` : src;
  if (!/^https?:\/\//i.test(absolute)) return null;
  if (/\.svg(\?|#|$)/i.test(absolute)) return null;
  return absolute;
}

export async function loadEmailSettings(
  supabase: SupabaseClient<Database>,
  siteUrl: string
): Promise<EmailSettings> {
  const { data, error } = await supabase.from("site_content").select("key, value_ro").in("key", [...KEYS]);
  if (error) throw error;
  const value = (key: (typeof KEYS)[number]) => data?.find((row) => row.key === key)?.value_ro?.trim() ?? "";
  const display = value("identity.display");

  return {
    brand: {
      // Her name as she set it. Until she has, the site's address rather
      // than the placeholder name the code keeps, which is not hers.
      siteName: value("general.site_name") || siteHost(siteUrl),
      logoUrl: emailImage(value("identity.logo"), siteUrl),
      display: display === "logo" || display === "both" ? display : "name",
      businessName: value("legal.business_name") || null,
      address: value("legal.address") || null,
      siteUrl,
    },
    replyTo: validEmail(value("email.reply_to")) ?? validEmail(value("legal.email")),
  };
}
