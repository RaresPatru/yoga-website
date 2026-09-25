import { test, expect, type Page } from "@playwright/test";
import {
  anonStorageClient,
  bucharestDate,
  dashboardCounts,
  deleteEventBySlug,
  deleteMessages,
  deletePostBySlug,
  deleteTestimonial,
  eventOverview,
  seedEvent,
  seedMessage,
  seedPost,
  seedRegistrationFor,
  seedTestimonial,
  seedWaitingEntry,
  unique,
} from "./helpers";

/**
 * The dashboard (app/admin/(panel)/page.tsx) and the two views behind it
 * (supabase/migrations/20260924000400_admin_dashboard.sql).
 *
 * The rules are checked against the views directly, as differences: other
 * specs leave their own rows behind while they run, so an absolute count would
 * depend on the order the suite runs in, while "one more of this kind counts,
 * one more of that kind does not" does not.
 */

test.describe("the dashboard's counts", () => {
  /**
   * "Evenimente" opens the admin list on its Upcoming tab, so it counts what
   * that tab holds: events to come, events under way, and events that are over
   * with a payment or refund still pending.
   */
  test("active events are the ones the Upcoming tab holds", async () => {
    const before = (await dashboardCounts()).active_events;
    const seeded = await Promise.all([
      seedEvent(), // upcoming: counts
      // Started yesterday, ends tomorrow: under way, so it counts.
      seedEvent({ date: bucharestDate(-1), time: "10:00", end_date: bucharestDate(1) }),
      seedEvent({ date: bucharestDate(-3) }), // over, nothing pending: does not count
      seedEvent({ published: false }), // a draft: does not count
    ]);
    // Over, with a checkout still inside its hour: it still needs her.
    const endedPending = await seedEvent({ date: bucharestDate(-3), price: 100 });
    seeded.push(endedPending);
    await seedRegistrationFor(endedPending.id, { payment_status: "pending" });
    try {
      expect((await dashboardCounts()).active_events).toBe(before + 3);
      expect((await eventOverview(endedPending.id)).status).toBe("ended_pending");
      expect((await eventOverview(seeded[2].id)).status).toBe("archived");
      expect((await eventOverview(seeded[1].id)).status).toBe("ongoing");
    } finally {
      await Promise.all(seeded.map((e) => deleteEventBySlug(e.slug)));
    }
  });

  test("pending payments are only the checkouts still holding a seat", async () => {
    const event = await seedEvent({ price: 120 });
    try {
      const before = (await dashboardCounts()).pending_payments;
      await seedRegistrationFor(event.id, { payment_status: "pending" });
      // Abandoned two hours ago: past the one-hour hold, so no longer pending.
      await seedRegistrationFor(event.id, {
        payment_status: "pending",
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      });
      await seedRegistrationFor(event.id, { payment_status: "completed" });

      expect((await dashboardCounts()).pending_payments).toBe(before + 1);
      expect((await eventOverview(event.id)).pending_payments).toBe(1);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("the waiting list counts people still in line, not those holding an offer", async () => {
    const event = await seedEvent({ max_participants: 0 });
    try {
      await seedWaitingEntry(event.id, "none"); // waiting
      await seedWaitingEntry(event.id, "expired"); // their link lapsed: back in line
      await seedWaitingEntry(event.id, "open"); // holding a live link: an offer, not waiting
      expect((await eventOverview(event.id)).waiting).toBe(2);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("drafts, unread messages and testimonials to approve", async () => {
    const before = await dashboardCounts();
    const draft = await seedPost({ published: false });
    const live = await seedPost({ published: true });
    // Hidden is its own tab in the post list, so not a draft here either.
    const hiddenDraft = await seedPost({ published: false, hidden: true });
    const now = new Date().toISOString();
    const messages = [
      await seedMessage(), // unread: counts
      await seedMessage({ read_at: now }), // opened
      await seedMessage({ archived_at: now }), // archived without opening
    ];
    const waiting = await seedTestimonial(false);
    const approved = await seedTestimonial(true);
    try {
      const after = await dashboardCounts();
      expect(after.draft_posts).toBe(before.draft_posts + 1);
      expect(after.unread_messages).toBe(before.unread_messages + 1);
      expect(after.pending_testimonials).toBe(before.pending_testimonials + 1);
    } finally {
      await deletePostBySlug(draft.slug);
      await deletePostBySlug(live.slug);
      await deletePostBySlug(hiddenDraft.slug);
      await deleteMessages(messages);
      await deleteTestimonial(waiting);
      await deleteTestimonial(approved);
    }
  });

  test("visitors cannot read either view", async () => {
    const anon = await anonStorageClient();
    for (const view of ["admin_dashboard", "admin_event_overview"]) {
      const { data, error } = await anon.from(view).select("*");
      expect(error, `${view} must refuse the publishable key`).not.toBeNull();
      expect(data).toBeNull();
    }
  });
});

/**
 * Serves the dashboard fixed counts, so the sentences can be checked for every
 * plural form without arranging the database into each shape.
 */
async function serveCounts(page: Page, counts: Record<string, number>) {
  await page.route("**/rest/v1/admin_dashboard*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(counts) })
  );
}

/** The dashboard row for one section, found by the section's name. */
function row(page: Page, section: string) {
  return page.getByRole("main").getByRole("link", { name: new RegExp(`^${section}\\b`) });
}

test.describe("the dashboard page", () => {
  test("says each count as a sentence, and 'Totul la zi' when nothing is waiting", async ({ page }) => {
    await serveCounts(page, {
      active_events: 1,
      pending_payments: 0,
      draft_posts: 21,
      unread_messages: 2,
      pending_testimonials: 0,
    });
    await page.goto("/admin");

    // One, few and other: Romanian's three plural forms.
    await expect(row(page, "Evenimente")).toContainText("1 eveniment activ");
    await expect(row(page, "Mesaje")).toContainText("2 mesaje necitite");
    await expect(row(page, "Articole")).toContainText("21 de ciorne");
    await expect(row(page, "Înscrieri")).toContainText("Totul la zi");
    await expect(row(page, "Testimoniale")).toContainText("Totul la zi");

    await page.getByRole("button", { name: "Switch to English" }).click();
    await expect(row(page, "Events")).toContainText("1 active event");
    await expect(row(page, "Messages")).toContainText("2 unread messages");
    await expect(row(page, "Blog posts")).toContainText("21 drafts");
    await expect(row(page, "Registrations")).toContainText("All caught up");
    await page.getByRole("button", { name: "Treci la română" }).click();
    await expect(row(page, "Evenimente")).toBeVisible();
  });

  test("each row opens its list with the filter it counted", async ({ page }) => {
    await page.goto("/admin");
    const links: Array<[string, string]> = [
      ["Evenimente", "/admin/events"],
      ["Înscrieri", "/admin/registrations?status=pending"],
      ["Mesaje", "/admin/messages?filter=unread"],
      ["Testimoniale", "/admin/testimonials?tab=pending"],
      ["Articole", "/admin/blog?tab=drafts"],
    ];
    for (const [section, href] of links) {
      await expect(row(page, section)).toHaveAttribute("href", href);
    }
    await row(page, "Mesaje").click();
    await expect(page.getByRole("heading", { level: 1, name: "Mesaje" })).toBeVisible();
  });

  test("the next event is the soonest one that has not ended, with its numbers", async ({ page }) => {
    // Under way since yesterday, so it comes before anything that has not started.
    const event = await seedEvent({
      title_ro: `Retreat în desfășurare ${unique("t")}`,
      date: bucharestDate(-1),
      time: "10:00",
      end_date: bucharestDate(1),
      price: 150,
      max_participants: 5,
    });
    try {
      await seedRegistrationFor(event.id, { payment_status: "completed" });
      await seedRegistrationFor(event.id, { payment_status: "pending" });
      await seedWaitingEntry(event.id, "none");

      await page.goto("/admin");
      const panel = page.getByRole("region", { name: "Următorul eveniment" });
      await expect(panel).toContainText("Retreat în desfășurare");
      await expect(panel).toContainText("În desfășurare");
      // A pending checkout holds its seat, so two of five are taken.
      await expect(panel.getByRole("definition").nth(0)).toHaveText("2 din 5");
      await expect(panel.getByRole("definition").nth(1)).toHaveText("1");
      await expect(panel.getByRole("definition").nth(2)).toHaveText("1");
      await expect(panel.getByRole("link", { name: /Vezi pagina evenimentului/ })).toHaveAttribute(
        "href",
        `/ro/events/${event.slug}`
      );
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("the next event's title opens it in the editor", async ({ page }) => {
    const event = await seedEvent({ title_ro: `Cel mai apropiat ${unique("t")}`, date: bucharestDate(0), time: "23:59" });
    try {
      await page.goto("/admin");
      const panel = page.getByRole("region", { name: "Următorul eveniment" });
      await expect(panel.getByRole("link", { name: /Cel mai apropiat/ })).toHaveAttribute(
        "href",
        `/admin/events/${event.id}`
      );
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("the quick actions open an empty event and an empty post", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("link", { name: "Eveniment nou" }).click();
    // Both editors have addresses of their own now.
    await expect(page).toHaveURL(/\/admin\/events\/new$/);
    await expect(page.getByLabel("Titlu (RO)", { exact: true })).toHaveValue("");

    await page.goto("/admin");
    await page.getByRole("link", { name: "Articol nou" }).click();
    // The post editor has an address of its own now.
    await expect(page).toHaveURL(/\/admin\/blog\/new$/);
    await expect(page.getByLabel("Titlu (RO)", { exact: true })).toHaveValue("");
  });
});
