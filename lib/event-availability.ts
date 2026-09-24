import type { createPublicClient } from "@/lib/supabase/public";

export interface Availability {
  capacity: number | null;
  taken: number;
}

/**
 * How many seats each of these events has, and how many are taken.
 *
 * WHY IT READS A VIEW AND NOT THE TABLE
 *
 * The seat count lives in `registrations`, which also holds names, email
 * addresses and phone numbers — so it is readable only by an administrator, and
 * a public page asking for it gets an empty list rather than an error. That is
 * how the waiting list was once broken in production for everyone: the count
 * came back as zero, so no event was ever full, so the "join the waiting list"
 * screen existed but was unreachable.
 *
 * `event_availability` is a view over the same rows that exposes only
 * `(event_id, capacity, taken)`. Aggregation is the privacy boundary: a total
 * tells you nothing about who is in it, so the view can be public while the
 * table stays shut.
 *
 * WHY IT IS A FUNCTION AND NOT TWO COPIES
 *
 * The home page and the events index both need this, and both had their own
 * identical copy of the query, the map and the inline type. That is two places
 * to edit when the view gains a column or the hold window changes its meaning —
 * and the failure mode of missing one is a page that quietly disagrees with the
 * other about whether an event is full.
 *
 * Takes the caller's client rather than making its own, so it inherits whatever
 * that page already decided about identity. Every current caller passes
 * `createPublicClient()`.
 */
export async function eventAvailability(
  supabase: ReturnType<typeof createPublicClient>,
  eventIds: string[]
): Promise<Map<string, Availability>> {
  const availability = new Map<string, Availability>();

  // `.in()` with an empty list is a query that cannot match anything. Skipping
  // it saves a round trip on a page with no upcoming events.
  if (!eventIds.length) return availability;

  const { data: rows } = await supabase
    .from("event_availability")
    .select("event_id, capacity, taken")
    .in("event_id", eventIds);

  for (const row of rows ?? []) {
    if (!row.event_id) continue;
    availability.set(row.event_id, { capacity: row.capacity, taken: row.taken ?? 0 });
  }

  return availability;
}
