import { createPublicClient } from "@/lib/supabase/public";
import { generateICS } from "@/lib/calendar";
import { absoluteUrl } from "@/lib/site-config";

/**
 * The slug, reduced to something that cannot break the header it goes in.
 *
 * `Content-Disposition` puts the filename inside double quotes, and the slug is
 * free text: `events.slug` is `text unique not null` with no format constraint
 * and she types it into a plain input. A quote in one closes the quoted string
 * early and the rest of the slug becomes header syntax; a carriage return or
 * newline makes the runtime reject the header outright, so the route answers
 * 500 instead of serving the entry.
 *
 * An allowlist rather than a list of characters to strip, for the same reason
 * lib/map-link.ts allowlists schemes: what is safe here is a short, known set,
 * and anything outside it is a character this filename does not need. Anything
 * unusable collapses to a hyphen, and a slug of nothing but unusable characters
 * still yields a valid filename rather than `".ics"`.
 */
function safeFilename(slug: string): string {
  const cleaned = slug
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    // A diacritic sitting next to a hyphen leaves two: "seară-de-yin" would
    // otherwise download as "sear--de-yin", which she may well see.
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "eveniment";
}

/**
 * The event as a calendar entry, served from a URL.
 *
 * WHY A ROUTE AND NOT A BLOB
 *
 * "Add to calendar" used to build the .ics in the browser, wrap it in a Blob and
 * click a generated `<a download>`. That produces a *file*, and a file is the
 * one thing an iPhone cannot do much with — it lands in Files and the visitor
 * has to go and find it. Navigating to a URL that answers `text/calendar` is
 * different: iOS hands it straight to the Calendar app, which opens its own
 * "Add Event" sheet with everything already filled in. macOS Safari does the
 * same. That is the behaviour that was actually wanted, and the blob was what
 * prevented it.
 *
 * It also means the entry is generated from the row rather than from whatever
 * the page happened to be rendered with, so a link someone saved keeps working
 * and reflects the current time and place.
 *
 * WHAT IT WILL NOT SERVE
 *
 * Unpublished events. No session is attached, so Row Level Security applies and
 * a draft cannot be fished out by guessing its slug — the same rule the share
 * card routes rely on.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const locale = new URL(req.url).searchParams.get("locale") === "en" ? "en" : "ro";

  const supabase = createPublicClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, slug, title_ro, title_en, description_ro, description_en, date, time, end_date, end_time, location")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!event) {
    return new Response("Not found", { status: 404 });
  }

  const title = locale === "ro" ? event.title_ro : event.title_en || event.title_ro;
  const description =
    (locale === "ro" ? event.description_ro : event.description_en || event.description_ro) ?? "";

  const ics = generateICS({
    title,
    // The description is plain text from a textarea, so it goes in as-is. The
    // page link goes with it: a calendar entry with no way back to the event is
    // a dead end three weeks later when somebody wants to check the address.
    description,
    date: event.date,
    time: event.time,
    location: event.location || "",
    // The database id, so this entry and the one in her confirmation email are
    // the same entry rather than two copies of the same class. See the note on
    // `uid` in lib/utils.ts.
    uid: event.id,
    // Her stated end, where she has given one. Without these every entry the
    // site produced was ninety minutes, retreats included; and a row with no
    // start time becomes an all-day entry rather than one at midnight.
    endDate: event.end_date,
    endTime: event.end_time,
    // Encoded, because the slug is free text. `events.slug` is `text unique
    // not null` with no format CHECK and she types it by hand, so a space or an
    // accent in one produces a `URL:` property that strict parsers reject.
    url: absoluteUrl(`/${locale}/events/${encodeURIComponent(event.slug)}`),
  });

  return new Response(ics, {
    headers: {
      // `charset=utf-8` matters: these titles have ă, î and ș in them.
      "Content-Type": "text/calendar; charset=utf-8",
      /*
       * `inline`, not `attachment`. Attachment tells iOS to download the file
       * instead of opening it, which is exactly the behaviour this route exists
       * to avoid. The filename is still honoured by the desktop browsers that
       * download it anyway, because they cannot display text/calendar.
       */
      "Content-Disposition": `inline; filename="${safeFilename(event.slug)}.ics"`,
      // Times and places change. A calendar entry fetched from a stale cache
      // would send somebody to last month's address.
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
