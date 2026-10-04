/**
 * Which device and which browser, as far as the user agent will admit.
 *
 * DETECTION RANKS, IT NEVER GATES
 *
 * User-agent sniffing is wrong eventually, for everybody, and the usual way it
 * fails is that somebody is handed a path that does not work for them with no
 * way out. So nothing here decides whether a visitor *can* do something — it
 * only decides what order the options are listed in. When the guess is wrong
 * the cost is a slightly odd order in a menu where every option is present and
 * working.
 *
 * That is the whole design. It is worth saying plainly because the tempting
 * version — "if iOS, show the .ics; otherwise show Google" — is one line
 * shorter and strands an iPhone owner who lives in Google Calendar.
 */

export type CalendarKind = "apple" | "google" | "outlook";

export interface Platform {
  /** iPhone, iPad or Mac. All three want the .ics, which opens Calendar. */
  apple: boolean;
  /**
   * A web view embedded in another app — Instagram, Facebook, TikTok.
   *
   * These are where handing a file to the operating system is least reliable:
   * the view may swallow the navigation, or download the .ics somewhere the
   * visitor cannot reach. Which is exactly the audience this site has, since
   * almost everyone arrives from an Instagram link.
   */
  inApp: boolean;
  /** Which calendar to put at the top of the menu. */
  preferred: CalendarKind;
}

/** Instagram, Facebook/Messenger, TikTok, LinkedIn, Pinterest, Snapchat. */
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|musical_ly|BytedanceWebview|TikTok|LinkedInApp|Pinterest|Snapchat/i;

/**
 * iPadOS 13 and later report themselves as "Macintosh", which is usually a
 * nuisance and here is not: a Mac wants the .ics too, so both readings land on
 * the same branch. Hence the family rather than an attempt to tell an iPhone
 * from an iPad from a desktop.
 */
const APPLE = /iPad|iPhone|iPod|Macintosh/i;

export function detectPlatform(userAgent: string): Platform {
  const apple = APPLE.test(userAgent);
  const inApp = IN_APP.test(userAgent);

  return {
    apple,
    inApp,
    /*
     * Inside another app's web view, Google goes first even on an iPhone.
     * Handing an .ics to iOS from inside Instagram is the case most likely to
     * do nothing visible, and a link to a web page is the thing every embedded
     * browser can still do. The .ics stays in the list directly underneath.
     */
    preferred: apple && !inApp ? "apple" : "google",
  };
}

/**
 * The platform as seen from the browser, computed once.
 *
 * Split from `detectPlatform` so the rules above can be tested against fixed
 * strings without a DOM, and so the component has one thing to call.
 *
 * THE CACHE IS LOAD-BEARING, NOT AN OPTIMISATION
 *
 * This is read through `useSyncExternalStore`, which compares snapshots by
 * reference to decide whether anything changed. Returning a fresh object each
 * call would be a new reference every time, so React would conclude the store
 * had changed on every render and re-render forever. The user agent cannot
 * change while the page is open, so computing it once is also simply true.
 */
let cached: Platform | null = null;

export function currentPlatform(): Platform {
  if (!cached) {
    cached = detectPlatform(typeof navigator === "undefined" ? "" : navigator.userAgent);
  }
  return cached;
}

/**
 * What the server assumes before it knows.
 *
 * Apple and not in-app, because that is the plurality of this audience and it
 * makes the common case correct in the HTML, before a line of JavaScript runs.
 * It is only an ordering, so being wrong costs nothing but position.
 */
export const SERVER_PLATFORM: Platform = { apple: true, inApp: false, preferred: "apple" };
