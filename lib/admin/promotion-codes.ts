import { AdminError, must } from "@/lib/admin/db";
import { getAuthToken } from "@/lib/get-auth-token";
import { createClient } from "@/lib/supabase/client";
import type { NewPromotionCode, PromotionCodeView } from "@/lib/promotion-codes";

/**
 * The Coduri de reducere screen's calls: to /api/admin/promotion-codes for
 * the codes themselves, which live in Stripe and which only the server can
 * reach with the secret key (lib/promotion-codes.ts says why they are kept
 * there), and to the database for who received each one by email
 * (admin_code_recipients) and who paid with it.
 */

/**
 * A refusal with the word the form translates (code, value, currency,
 * last_day, uses, uses_below, exists, not_usable, stale, not_found, stripe)
 * and any numbers that go into its sentence.
 */
export class CodeError extends AdminError {
  constructor(
    readonly reason: string,
    message: string,
    readonly details: Record<string, number> = {}
  ) {
    super(reason === "stripe" ? "unknown" : "invalid", message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new AdminError("session", "Not signed in as the admin");
  if (!response.ok) {
    const details: Record<string, number> = {};
    for (const [key, value] of Object.entries(data)) if (typeof value === "number") details[key] = value;
    throw new CodeError(typeof data.code === "string" ? data.code : "stripe", data.error ?? "Failed", details);
  }
  return data as T;
}

export async function listCodes(): Promise<PromotionCodeView[]> {
  return (await call<{ codes: PromotionCodeView[] }>("/api/admin/promotion-codes")).codes;
}

export async function createCode(input: NewPromotionCode): Promise<PromotionCodeView> {
  return (
    await call<{ code: PromotionCodeView }>("/api/admin/promotion-codes", {
      method: "POST",
      body: JSON.stringify(input),
    })
  ).code;
}

export async function setCodeActive(id: string, active: boolean): Promise<PromotionCodeView> {
  return (
    await call<{ code: PromotionCodeView }>(`/api/admin/promotion-codes/${id}`, {
      method: "POST",
      body: JSON.stringify({ active }),
    })
  ).code;
}

/** Changes a code. Stripe answers with a new version in its place, which has a new id. */
export async function editCode(id: string, input: NewPromotionCode): Promise<PromotionCodeView> {
  return (
    await call<{ code: PromotionCodeView }>(`/api/admin/promotion-codes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    })
  ).code;
}

export async function deleteCode(id: string): Promise<void> {
  await call(`/api/admin/promotion-codes/${id}`, { method: "DELETE" });
}

/** Undo for a deletion. */
export async function restoreCode(id: string): Promise<PromotionCodeView> {
  return (
    await call<{ code: PromotionCodeView }>(`/api/admin/promotion-codes/${id}`, {
      method: "POST",
      body: JSON.stringify({ restore: true }),
    })
  ).code;
}

/** Someone an announcement carried a code to. */
export interface CodeRecipient {
  email: string;
  fullName: string;
  announcementId: string;
  /** The announcement's Romanian subject. */
  subject: string;
  sentAt: string;
  /** They paid for a booking with this code. */
  used: boolean;
}

/**
 * Everyone an announcement carried `word` to, since `since` when given, one
 * line per person with the latest announcement that reached them, newest
 * first.
 */
export async function codeRecipients(word: string, since?: string): Promise<CodeRecipient[]> {
  const supabase = createClient();
  let query = supabase
    .from("admin_code_recipients")
    .select("email, full_name, announcement_id, announcement_subject, sent_at")
    .eq("code", word.toUpperCase())
    .order("sent_at", { ascending: false });
  if (since) query = query.gte("sent_at", since);
  const [rows, payers] = await Promise.all([
    query,
    // The code as Stripe holds it is what a booking records; any case.
    supabase.from("admin_participants").select("email_key").ilike("discount_code", word),
  ]);
  const used = new Set((must(payers) ?? []).map((row) => row.email_key));
  const people = new Map<string, CodeRecipient>();
  for (const row of must(rows) ?? []) {
    if (!row.email || people.has(row.email)) continue;
    people.set(row.email, {
      email: row.email,
      fullName: row.full_name ?? "",
      announcementId: row.announcement_id ?? "",
      subject: row.announcement_subject ?? "",
      sentAt: row.sent_at ?? "",
      used: used.has(row.email),
    });
  }
  return [...people.values()];
}

/** The codes an address received by email, each with the announcement that carried it, newest first. */
export async function codesReceivedBy(
  email: string
): Promise<{ code: string; announcementId: string; subject: string; sentAt: string }[]> {
  const rows = must(
    await createClient()
      .from("admin_code_recipients")
      .select("code, announcement_id, announcement_subject, sent_at")
      .eq("email", email.toLowerCase())
      .order("sent_at", { ascending: false })
  );
  return (rows ?? []).map((row) => ({
    code: row.code ?? "",
    announcementId: row.announcement_id ?? "",
    subject: row.announcement_subject ?? "",
    sentAt: row.sent_at ?? "",
  }));
}
