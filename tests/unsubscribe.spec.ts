import { test, expect } from "@playwright/test";
import {
  adminAccessToken,
  clearMailbox,
  deleteAnnouncementsTitled,
  deleteEventBySlug,
  deleteSuppression,
  emailsTo,
  seedAnnouncement,
  seedEvent,
  seedRegistrationFor,
  setMarketingConsent,
  suppressionFor,
  unique,
} from "./helpers";

/**
 * The page an announcement's "Dezabonează-te" link opens. Opening it changes
 * nothing, because mail scanners open every link in an email; its one button
 * does, as a plain form post that works before any script has loaded. Runs on
 * the phone project too: that is where the email is read.
 */

const SUBJECT = "Dezabonare E2E";

test.describe("unsubscribing from announcements", () => {
  test.afterAll(async () => {
    await deleteAnnouncementsTitled(SUBJECT);
  });

  test("the link in the email opens a page whose button unsubscribes", async ({ page, request }) => {
    const event = await seedEvent({ max_participants: 5 });
    const email = `unsub-${unique("u")}@example.com`;
    try {
      const booking = await seedRegistrationFor(event.id, { email, full_name: "Ana Pleacă" });
      await setMarketingConsent(booking, new Date(Date.now() - 60_000));
      await clearMailbox(email);
      const id = await seedAnnouncement({
        subject_ro: `${SUBJECT} ${unique("s")}`,
        body_ro: "<p>Noutăți.</p>",
        audience: { kind: "ids", ids: [booking] },
      });
      const sent = await request.post(`/api/admin/announcements/${id}/send`, {
        headers: { Authorization: `Bearer ${await adminAccessToken()}` },
        data: {},
      });
      expect(sent.status()).toBe(200);

      const [message] = await emailsTo(email);
      const link = message.HTML.match(/href="(https?:[^"]*\/ro\/unsubscribe\?token=[\w-]+)"/)![1];

      await page.goto(new URL(link).pathname + new URL(link).search);
      await expect(page.getByRole("heading", { level: 1, name: "Dezabonare" })).toBeVisible();
      await expect(page.getByText("nu mai primești anunțuri despre evenimentele noi")).toBeVisible();
      expect(await suppressionFor(email), "opening the page is not unsubscribing").toBeNull();

      await page.getByRole("button", { name: "Dezabonează-mă" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Te-ai dezabonat" })).toBeVisible();
      await expect(page).toHaveURL(/\/ro\/unsubscribe\?done=1$/);
      expect((await suppressionFor(email))?.reason).toBe("unsubscribed");
    } finally {
      await deleteEventBySlug(event.slug);
      await deleteSuppression(email);
    }
  });

  test("a link that matches nobody says so and points to the contact page", async ({ page }) => {
    await page.goto("/en/unsubscribe?token=this-is-not-a-real-token-0000000000");
    await page.getByRole("button", { name: "Unsubscribe me" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "This link no longer works" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Write to us" })).toHaveAttribute("href", "/en/contact");
  });

  test("the page asks search engines to leave it out", async ({ page }) => {
    await page.goto("/ro/unsubscribe?done=1");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
