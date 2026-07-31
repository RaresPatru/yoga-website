import { test, expect } from "@playwright/test";
import { loginAsAdmin, logout, adminCreds } from "./helpers";

test.describe("admin login", () => {
  test("unauthenticated access to /admin redirects to login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("wrong password shows an error", async ({ page }) => {
    const { email } = adminCreds();
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Parolă").fill("parola-gresita-123");
    await page.getByRole("button", { name: "Autentificare" }).click();
    await expect(page.locator("p.text-error")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("valid credentials land on the dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  });

  test("logout returns to the login page", async ({ page }) => {
    await loginAsAdmin(page);
    await logout(page);
    await expect(page.getByRole("heading", { name: "Autentificare Admin" })).toBeVisible();
  });
});
