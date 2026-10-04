/**
 * Visitor statistics: the rules.
 *
 * Kept apart from the code that loads PostHog
 * (components/providers/analytics.tsx) so that each rule can be tested on its
 * own, and so that next.config.ts can name the one address the browser may
 * send statistics to. Nothing here touches the browser: every function is
 * handed what it needs.
 *
 * WHAT IS COUNTED
 *
 * Pages opened, and the six events in AnalyticsEvents below. No names, no
 * email addresses, nothing typed into a form, no clicks recorded on their own
 * and no recordings of the screen. Nothing is kept in the visitor's browser,
 * so a visit cannot be linked to the next one (DECISIONS.md, "Visitor
 * statistics").
 */

/** PostHog's EU cloud, in Frankfurt. The statistics go nowhere else. */
export const POSTHOG_EU_HOST = "https://eu.i.posthog.com";

/** This machine, or one on its local network (a phone on the Wi-Fi reaching the dev server). */
export function isLocalHostname(hostname: string): boolean {
  const name = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local") ||
    name === "0.0.0.0" ||
    name === "::1" ||
    /^127\./.test(name) ||
    /^10\./.test(name) ||
    /^192\.168\./.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(name) ||
    /^169\.254\./.test(name) ||
    /^f[cd][0-9a-f]{2}:/.test(name) ||
    /^fe80:/.test(name)
  );
}

/**
 * Where the statistics are sent: PostHog's EU cloud, or a stand-in on this
 * machine.
 *
 * NEXT_PUBLIC_POSTHOG_HOST is honoured for one thing only, the test suite's
 * stand-in (tests/fake-posthog.ts). Any other value is ignored, so no setting
 * in Vercel can send visitors' data outside the EU: a key from a project in
 * another region simply gets nothing through.
 */
export function analyticsHost(configured: string | undefined = process.env.NEXT_PUBLIC_POSTHOG_HOST): string {
  if (configured) {
    try {
      const url = new URL(configured);
      if ((url.protocol === "http:" || url.protocol === "https:") && isLocalHostname(url.hostname)) return url.origin;
    } catch {
      // Not an address: the EU cloud, below.
    }
  }
  return POSTHOG_EU_HOST;
}

/**
 * The query parameters that are keys, not places: a waiting-list claim
 * (?claim=), the links to cancel a booking, write a testimonial or
 * unsubscribe (?token=), and the Stripe checkout a visitor came back from
 * (?checkout=). Whoever holds one can use it.
 */
export const SECRET_PARAMS = ["claim", "token", "checkout"] as const;

/**
 * Advertising click identifiers that Instagram, Facebook, Google and others
 * add to links (fbclid, igshid, gclid…). Each one is unique to a click and
 * can be matched to a person by the company that issued it, which is more
 * than a count of visits needs.
 */
export const CLICK_ID_PARAMS = [
  "fbclid",
  "igshid",
  "gclid",
  "gclsrc",
  "gad_source",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "twclid",
  "ttclid",
  "li_fat_id",
  "rdt_cid",
  "epik",
  "qclid",
  "sccid",
  "irclid",
  "mc_eid",
  "_kx",
] as const;

const REDACTED_PARAMS: readonly string[] = [...SECRET_PARAMS, ...CLICK_ID_PARAMS];

/*
 * One of those parameters and its value, wherever it sits in a string: after
 * ?, & or # in an address, or percent-encoded inside another address (a
 * referrer such as l.instagram.com/?u=https%3A%2F%2F…%3Ftoken%3D…). The value
 * runs to the next delimiter, plain or encoded.
 */
const PARAM_VALUE = new RegExp(
  `([?&#]|%3F|%26|%23)(${REDACTED_PARAMS.join("|")})(=|%3D)(?:[^&#%\\s]|%(?!26|23))*`,
  "gi"
);

/** Text with the value of every key and click identifier in it replaced by "redacted". */
export function withoutSecrets(text: string): string {
  return text.replace(PARAM_VALUE, "$1$2$3redacted");
}

/*
 * A property holding a click identifier on its own, outside any address:
 * PostHog copies them out of the address as `fbclid`, and again as
 * `$session_entry_fbclid` for the page a visit began on.
 *
 * Only click identifiers. The keys above appear only in addresses, and a
 * property called `token` is PostHog's own: the project key it files the
 * event under, without which PostHog throws the event away.
 */
const CLICK_ID_PROPERTY = new RegExp(`^(?:\\$(?:session_entry_|initial_))?(?:${CLICK_ID_PARAMS.join("|")})$`);

/**
 * An event's properties with every string in them, at any depth, cleaned the
 * same way. PostHog attaches the page's address under several names
 * ($current_url, $referrer, $session_entry_url…) and copies click
 * identifiers into properties of their own, so the cleaning goes through
 * everything rather than a list of names that a new version of the library
 * could outgrow.
 */
export function scrubbed<T>(value: T, depth = 0): T {
  if (typeof value === "string") return withoutSecrets(value) as T;
  if (value === null || typeof value !== "object" || depth > 6 || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => scrubbed(item, depth + 1)) as T;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      CLICK_ID_PROPERTY.test(key) && typeof item === "string" ? "redacted" : scrubbed(item, depth + 1),
    ])
  ) as T;
}

/*
 * Pages that are never counted: the admin's previews, which are her own work,
 * and the pages reached through someone's personal link (cancelling a
 * booking, writing a testimonial, unsubscribing), which exist for one person
 * each and show their details.
 */
const UNCOUNTED = /^\/[a-z]{2}\/(?:preview|booking|unsubscribe|testimonials\/write)(?:\/|$)/;

export function isCounted(pathname: string): boolean {
  return !UNCOUNTED.test(pathname);
}

/**
 * The address of a page as a page view: two addresses that differ only in the
 * keys above, or in `paid`, are one view. The booking panel takes them out of
 * the address as soon as it has read them (components/events/
 * event-registration.tsx), and that tidying is not a second visit.
 */
export function pageKey(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  for (const name of [...SECRET_PARAMS, "paid"]) params.delete(name);
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

export interface Circumstances {
  /** The project key this build carries (NEXT_PUBLIC_POSTHOG_KEY). */
  key: string | undefined;
  /** Where the statistics would go: analyticsHost(). */
  host: string;
  /** The address of the page being shown. */
  page: { origin: string; hostname: string };
  /** The site's public address (NEXT_PUBLIC_SITE_URL), set in Vercel for production only. */
  site: string | undefined;
  /** NEXT_PUBLIC_POSTHOG_DEBUG=1: a deliberate test, from whatever address the build is opened at. */
  debug: boolean;
  /** This browser holds a signed-in session for the admin panel: hers, or Rares'. */
  signedIn: boolean;
  /** The browser asks not to be tracked: Global Privacy Control or Do Not Track. */
  optedOut: boolean;
  /** A browser driven by a program, a test or a crawler, which posthog-js would drop anyway. */
  automated: boolean;
}

function originOf(address: string | undefined): string | null {
  if (!address) return null;
  try {
    return new URL(address).origin;
  } catch {
    return null;
  }
}

/**
 * Why this visit is not counted, or null when it is.
 *
 * The statistics are hers, about her visitors, so they come from her site
 * alone: the address in NEXT_PUBLIC_SITE_URL, which only production has. A
 * preview, a development server, a phone on the Wi-Fi reaching one, the test
 * suite or a copy of the site somewhere else sends nothing, and a page on this
 * machine never sends to PostHog itself, whatever the settings say. A stand-in
 * on this machine may receive them: that is how the suite checks what would
 * be sent.
 *
 * `debug` lifts the address rules for a deliberate test. It never lifts the
 * visitor's own refusal or the admin's exclusion: those are promises. Nor the
 * automated browser: posthog-js would drop what it sends anyway, so a test
 * by hand has to be made in a browser a person drives.
 */
export function whyNotCounted(c: Circumstances): string | null {
  if (!c.key) return "this build has no PostHog key";
  if (c.optedOut) return "the browser asks not to be tracked";
  if (c.signedIn) return "this browser is signed in to the admin panel";
  if (c.automated) return "an automated browser";
  if (c.debug) return null;
  const toStandIn = c.host !== POSTHOG_EU_HOST;
  if (isLocalHostname(c.page.hostname) && !toStandIn) return "a page on this machine never sends to PostHog";
  if (c.page.origin !== originOf(c.site)) return "this is not the site's public address";
  return null;
}

/**
 * Everything the site records beyond page views, and what each carries. The
 * names are PostHog's to show her; docs/ADMIN-GUIDE.md explains them in
 * Romanian.
 */
export interface AnalyticsEvents {
  /** An event's page was opened. `sold_out` only while booking is open. */
  event_viewed: {
    event_slug: string;
    phase: "upcoming" | "ongoing" | "ended";
    paid: boolean;
    sold_out: boolean;
  };
  /**
   * The booking button (or the waiting list's) was pressed with the form
   * filled in: a press the browser stops for an empty required field sends
   * nothing.
   */
  booking_clicked: { event_slug: string; paid: boolean; waitlist: boolean };
  /**
   * A seat is theirs: a free booking, a claimed place, or a payment confirmed
   * when Stripe sends them back.
   */
  booking_completed: { event_slug: string; paid: boolean; via: "form" | "claim" | "checkout" };
  /**
   * What stopped a booking: the code the server answered with ("full",
   * "already_registered", "stripe"…), a check on the page ("phone",
   * "captcha", "note_consent"), or "network".
   */
  booking_failed: { event_slug: string; waitlist: boolean; reason: string };
  /** A place on the waiting list. */
  waitlist_joined: { event_slug: string };
  /** A post read to its end (components/blog/read-tracker.tsx says what counts). */
  blog_post_read: { post_slug: string; reading_minutes: number | null };
}
