import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** The arguments `register_for_event()` takes, as the database declares them. */
export type RegisterArgs = Database["public"]["Functions"]["register_for_event"]["Args"];

/** A seat was booked (with the new registration's id), or the database refused. */
export type RegisterOutcome = { ok: true; id: string } | { ok: false; reason: string };

/**
 * Books a seat through the `register_for_event()` database function.
 *
 * The function locks the event row while it counts, so two people can never
 * both take the last seat. It answers with JSON: `{ success, id }` when a
 * registration was created, or `{ error }` with a Romanian sentence when it
 * refused (event full, missing or unpublished). This turns that JSON into a
 * typed result. A failed call (network, permissions) throws instead, because
 * that is a fault, not an answer.
 */
export async function registerForEvent(
  supabase: SupabaseClient<Database>,
  args: RegisterArgs
): Promise<RegisterOutcome> {
  const { data, error } = await supabase.rpc("register_for_event", args);
  if (error) throw error;

  const result = (data ?? {}) as { success?: boolean; id?: unknown; error?: unknown };
  if (result.success === true && typeof result.id === "string") {
    return { ok: true, id: result.id };
  }
  return {
    ok: false,
    reason: typeof result.error === "string" ? result.error : "Înscrierea nu a putut fi făcută.",
  };
}
