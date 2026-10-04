/**
 * Where an event is in its life, from the instants Postgres computes for it
 * (`starts_at`, `ends_at`: supabase/migrations/20260924000200_event_bounds.sql).
 *
 *   upcoming  Not started. Booking is open while seats remain.
 *   ongoing   Started and not over. Booking has closed: it closes at the
 *             start, and an event with no announced hour starts at midnight.
 *   ended     Over. Its page says so and shows what participants said.
 *
 * The booking gate in the database applies the same start rule
 * (register_for_event); this decides what a page shows.
 */
export type EventPhase = "upcoming" | "ongoing" | "ended";

export function eventPhase(startsAt: string, endsAt: string, now: number = Date.now()): EventPhase {
  if (now < Date.parse(startsAt)) return "upcoming";
  if (now < Date.parse(endsAt)) return "ongoing";
  return "ended";
}
