import type { EmailTexts } from "@/lib/admin/emails";

/** Whether an email's text says anything: words, or an event card. */
export function hasWords(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim() !== "" || html.includes("data-event-card");
}

export function sameTexts(a: EmailTexts, b: EmailTexts): boolean {
  return a.subject_ro === b.subject_ro && a.subject_en === b.subject_en && a.body_ro === b.body_ro && a.body_en === b.body_en;
}

/** The sentence for a test email the server refused, by its code. */
export function testErrorKey(code: string): string {
  if (code === "no_address") return "admin.mail.test_no_address";
  if (code === "rate_limited") return "admin.mail.test_too_many";
  return "admin.mail.test_failed";
}
