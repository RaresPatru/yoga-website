import { expect, devices, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { RecordedEvent, RecordedRequest } from "./fake-posthog";

/**
 * Reading what the site sent the stand-in for PostHog (tests/fake-posthog.ts).
 *
 * PostHog loads after the page has finished loading and gone quiet, and sends
 * events in batches every few seconds, so anything that waits for an event
 * polls. A test that expects nothing proves it by first waiting for an event
 * it does expect from the same steps, then checking the other never came.
 */

const STAND_IN = "http://127.0.0.1:12112";

/**
 * An automated browser is not counted, as it should not be with real
 * traffic: navigator.webdriver set, or "HeadlessChrome" in the user agent or
 * among the browser's brands (navigator.userAgentData). The site does not
 * load PostHog for one, and posthog-js would drop what it sent. Playwright's
 * browsers are all three. A test that wants to see what a visitor's browser
 * would send makes its own look like one; without this, nothing arrives, and
 * a test that expects nothing passes for the wrong reason.
 */
export async function asVisitor(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
    const data = (navigator as Navigator & { userAgentData?: { brands: { brand: string; version: string }[]; mobile: boolean; platform: string } }).userAgentData;
    if (data) {
      const brands = data.brands.filter((entry) => !/headless/i.test(entry.brand));
      Object.defineProperty(navigator, "userAgentData", {
        get: () => ({ brands, mobile: data.mobile, platform: data.platform }),
        configurable: true,
      });
    }
  });
}

/**
 * A page in a fresh context of its own that looks like a visitor's. Signed
 * out even in the admin projects: a context made in a test starts from the
 * project's options, its saved session included, unless told otherwise.
 */
export async function visitorPage(browser: Browser, baseURL?: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL,
    userAgent: devices["Desktop Chrome"].userAgent,
    storageState: { cookies: [], origins: [] },
  });
  await asVisitor(context);
  return context.newPage();
}

export async function resetAnalytics() {
  await fetch(`${STAND_IN}/__control`, { method: "POST" });
}

export async function analyticsEvents(): Promise<RecordedEvent[]> {
  return (await fetch(`${STAND_IN}/__events`)).json();
}

/** Every request the site made of the stand-in, events or not. */
export async function analyticsRequests(): Promise<RecordedRequest[]> {
  return (await fetch(`${STAND_IN}/__requests`)).json();
}

/** The page an event was recorded on, as sent. */
export const pageOf = (event: RecordedEvent) => String(event.properties.$current_url ?? "");

/** Events called `name` recorded on a page whose address contains `marker`. */
export async function eventsOn(name: string, marker: string): Promise<RecordedEvent[]> {
  return (await analyticsEvents()).filter((event) => event.event === name && pageOf(event).includes(marker));
}

/** Waits until at least `count` such events have arrived, and returns them all. */
export async function waitForEvents(name: string, marker: string, count = 1): Promise<RecordedEvent[]> {
  await expect
    .poll(async () => (await eventsOn(name, marker)).length, {
      message: `${name} on a page containing "${marker}"`,
      timeout: 20_000,
      intervals: [500],
    })
    .toBeGreaterThanOrEqual(count);
  return eventsOn(name, marker);
}

/** Every event recorded on a page whose address contains `marker`, whatever its name. */
export async function anythingOn(marker: string): Promise<RecordedEvent[]> {
  return (await analyticsEvents()).filter((event) => pageOf(event).includes(marker));
}
