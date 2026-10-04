import { test, expect } from "@playwright/test";
import { deleteEventBySlug, seedEvent, unique } from "./helpers";
import {
  analyticsEvents,
  anythingOn,
  asVisitor,
  pageOf,
  resetAnalytics,
  visitorPage,
  waitForEvents,
} from "./analytics-helpers";

/**
 * Her own visits are not her visitors (components/providers/analytics.tsx).
 *
 * This project's browser is signed in to the admin panel, so it is the one to
 * show that a signed-in browser is not counted on the public site, and that
 * the admin panel and its previews never send anything. Each proof waits for
 * a signed-out visitor's page view first, from the same steps, so "nothing
 * arrived" cannot just mean "not yet".
 */

test.beforeEach(async ({ context }) => {
  await asVisitor(context);
  await resetAnalytics();
});

test("a browser signed in to the admin panel is not counted, there or on the site", async ({ page, browser, baseURL }) => {
  const marker = unique("admin-visit");
  const event = await seedEvent();
  try {
    await page.goto(`/ro?utm_source=${marker}-admin`);
    await page.goto(`/ro/events/${event.slug}?utm_source=${marker}-admin`);
    await page.goto(`/ro/preview/events/${event.id}`);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const visitor = await visitorPage(browser, baseURL);
    await visitor.goto(`/ro?utm_source=${marker}-visitor`);
    await waitForEvents("$pageview", `${marker}-visitor`);
    await visitor.waitForTimeout(1000);
    await visitor.context().close();

    expect(await anythingOn(`${marker}-admin`)).toEqual([]);
    const fromAdmin = (await analyticsEvents()).filter((e) => /\/admin|\/preview\//.test(pageOf(e)));
    expect(fromAdmin).toEqual([]);
  } finally {
    await deleteEventBySlug(event.slug);
  }
});
