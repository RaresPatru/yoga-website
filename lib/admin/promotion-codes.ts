import { AdminError } from "@/lib/admin/db";
import { getAuthToken } from "@/lib/get-auth-token";
import type { NewPromotionCode, PromotionCodeView } from "@/lib/promotion-codes";

/**
 * The Coduri de reducere screen's calls to /api/admin/promotion-codes. The
 * codes live in Stripe, which only the server can reach with the secret key;
 * lib/promotion-codes.ts says why they are kept there.
 */

/** A refusal with the word the form translates: code, value, currency, last_day, uses, exists, stripe. */
export class CodeError extends AdminError {
  constructor(
    readonly reason: string,
    message: string
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
  if (!response.ok) throw new CodeError(typeof data.code === "string" ? data.code : "stripe", data.error ?? "Failed");
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
