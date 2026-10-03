import type { FullConfig } from "@playwright/test";
import type { Server } from "node:http";
import { startFakeStripe } from "./fake-stripe";

/**
 * Starts the stand-in for Stripe, then warms the server once before any test
 * runs.
 *
 * The stand-in (tests/fake-stripe.ts) lives in this process for the whole
 * run, and the teardown returned below closes it. The site's server reaches
 * it through STRIPE_API_BASE (playwright.config.ts). If something already
 * listens on its port, a stand-in left by an earlier run or one a developer
 * started, that one is used.
 *
 * WARMING
 *
 * Playwright considers the web server "ready" as soon as `/` responds, but
 * every other route is still cold: on a production build each dynamic page
 * compiles its module graph and opens its first database connection on the
 * initial request. With three workers starting at once, several tests land on
 * cold routes simultaneously and a simple page load was taking 10-20 seconds —
 * long enough to trip the navigation timeout and fail for reasons that have
 * nothing to do with the code under test.
 *
 * Requesting each route once, sequentially, moves that cost out of the tests.
 * It also surfaces a genuinely broken route immediately and clearly, instead of
 * as a puzzling timeout inside an unrelated spec.
 */
async function globalSetup(config: FullConfig) {
  let fakeStripe: Server | null = null;
  try {
    fakeStripe = await startFakeStripe();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    console.warn("[global-setup] The fake Stripe's port is taken; using whatever listens there.");
  }

  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://localhost:3100";

  const routes = [
    "/ro",
    "/en",
    "/ro/events",
    "/ro/blog",
    "/ro/testimonials",
    "/ro/contact",
    "/en/events",
    "/en/blog",
    "/en/testimonials",
    "/en/contact",
    "/ro/booking",
    "/admin/login",
    "/sitemap.xml",
    "/robots.txt",
  ];

  for (const route of routes) {
    try {
      await fetch(`${baseURL}${route}`, { signal: AbortSignal.timeout(60_000) });
    } catch {
      // A failure here is not fatal — the route's own test will report it
      // properly. Warming is best effort.
    }
  }

  return async () => {
    await new Promise<void>((resolve) => (fakeStripe ? fakeStripe.close(() => resolve()) : resolve()));
  };
}

export default globalSetup;
