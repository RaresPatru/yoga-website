import { test, expect } from "@playwright/test";

test.describe("contact page (RO)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ro/contact");
  });

  test("renders all form fields with autocomplete attributes", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Contact" })).toBeVisible();
    const name = page.getByLabel("Nume");
    const email = page.getByLabel("Email");
    const subject = page.getByLabel("Subiect");
    const message = page.getByLabel("Mesaj");

    await expect(name).toBeVisible();
    await expect(email).toBeVisible();
    await expect(subject).toBeVisible();
    await expect(message).toBeVisible();

    await expect(name).toHaveAttribute("autocomplete", "name");
    await expect(email).toHaveAttribute("autocomplete", "email");
    await expect(page.getByRole("button", { name: "Trimite" })).toBeVisible();
  });

  test("submitting without a captcha token surfaces the security error", async ({ page }) => {
    await page.getByLabel("Nume").fill("Test E2E");
    await page.getByLabel("Email").fill("e2e@example.com");
    await page.getByLabel("Subiect").fill("Subiect test");
    await page.getByLabel("Mesaj").fill("Mesaj de test E2E.");
    await page.getByRole("button", { name: "Trimite" }).click();
    await expect(page.locator("p[role=alert]")).toHaveText("Completează verificarea de securitate.");
  });
});

test.describe("contact page (EN spot check)", () => {
  test("English locale renders English labels", async ({ page }) => {
    await page.goto("/en/contact");
    await expect(page.getByRole("heading", { name: "Contact" })).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Message")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });
});
