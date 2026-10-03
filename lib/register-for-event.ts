import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** The arguments `register_for_event()` takes, as the database declares them. */
export type RegisterArgs = Database["public"]["Functions"]["register_for_event"]["Args"];

/**
 * Why the database refused a booking. `started` is an event that has begun
 * (bookings close at its start), `full` has no seat left or no capacity set,
 * `already_registered` an address that already holds a seat on it (one seat
 * per email per event, audit B3), `unavailable` is a draft, `not_found` does
 * not exist.
 */
export type RefusalCode = "not_found" | "unavailable" | "started" | "full" | "already_registered" | "invalid";

/**
 * A seat was booked, with the registration's id, or the database refused.
 * `resumed` is the same person's unpaid checkout carrying on rather than a
 * new booking, with the Stripe session it had (`sessionId`), if any.
 */
export type RegisterOutcome =
  | { ok: true; id: string; resumed: boolean; sessionId: string | null }
  | { ok: false; code: RefusalCode; reason: string };

const CODES: readonly RefusalCode[] = ["not_found", "unavailable", "started", "full", "already_registered", "invalid"];

/**
 * Books a seat through the `register_for_event()` database function.
 *
 * The function locks the event row while it counts, so two people can never
 * both take the last seat, and one address can never take two. It answers
 * with JSON: `{ success, id }` when a registration was created, `{ success,
 * id, resumed, session_id }` when an unpaid one carries on, or `{ error, code }`
 * when it refused. This turns that JSON into a typed result. A failed call
 * (network, permissions) throws instead, because that is a fault, not an
 * answer.
 */
export async function registerForEvent(
  supabase: SupabaseClient<Database>,
  args: RegisterArgs
): Promise<RegisterOutcome> {
  const { data, error } = await supabase.rpc("register_for_event", args);
  if (error) throw error;

  const result = (data ?? {}) as {
    success?: boolean;
    id?: unknown;
    resumed?: unknown;
    session_id?: unknown;
    error?: unknown;
    code?: unknown;
  };
  if (result.success === true && typeof result.id === "string") {
    return {
      ok: true,
      id: result.id,
      resumed: result.resumed === true,
      sessionId: typeof result.session_id === "string" ? result.session_id : null,
    };
  }
  return {
    ok: false,
    code: CODES.includes(result.code as RefusalCode) ? (result.code as RefusalCode) : "invalid",
    reason: typeof result.error === "string" ? result.error : "Înscrierea nu a putut fi făcută.",
  };
}

/** Whether an event has started, from its `starts_at`. The database's rule, for the routes' early answers. */
export function hasStarted(startsAt: string, now = Date.now()): boolean {
  return Date.parse(startsAt) <= now;
}

/** The page's language from a request body: English when it says so, else Romanian. */
export function localeFrom(value: unknown): "ro" | "en" {
  return value === "en" ? "en" : "ro";
}
