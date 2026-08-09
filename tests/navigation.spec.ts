import { test, expect } from "@playwright/test";

const RO_PUBLIC_ROUTES = ["/blog", "/events", "/testimonials", "/contact"];
const EN_PUBLIC_ROUTES = ["/blog", "/events", "/testimonials", "/contact"];

test.describe("navigation and routing", () => {
  test("root redirects to /ro", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/ro$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  for (const route of ["/", ...RO_PUBLIC_ROUTES]) {
    test(`/ro${route} responds 200 with a page heading`, async ({ page }) => {
      const response = await page.goto(`/ro${route}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  for (const route of EN_PUBLIC_ROUTES) {
    test(`/en${route} responds 200`, async ({ page }) => {
      const response = await page.goto(`/en${route}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("unknown route returns 404", async ({ page }) => {
    const response = await page.goto("/ro/pagina-care-nu-exista");
    expect(response?.status()).toBe(404);
  });

  // Asserts the status as well as the body now.
  //
  // This used to check only that Next's stock "This page could not be found."
  // appeared, because at the time the response was HTTP 200 and asserting the
  // status would have failed. That 200 was the actual bug — a soft 404, which
  // search engines may index as a real page — and it stayed hidden precisely
  // because the test was written around it rather than at it.
  test("unknown blog slug returns 404 and shows the branded page", async ({ page }) => {
    const response = await page.goto("/ro/blog/slug-care-nu-exista");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /Pagina nu a fost găsită/ })).toBeVisible();
  });

  for (const route of ["/admin", "/admin/blog", "/admin/events", "/admin/registrations", "/admin/testimonials", "/admin/emails", "/admin/messages"]) {
    test(`unauthenticated ${route} redirects to /admin/login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/admin\/login/);
    });
  }

  test("admin login page is reachable and shows the login form", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { name: "Autentificare Admin" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Parolă")).toBeVisible();
    await expect(page.getByRole("button", { name: "Autentificare" })).toBeVisible();
  });
});
