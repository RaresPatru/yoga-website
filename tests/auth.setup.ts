import { test as setup, expect } from "@playwright/test";
import { adminCreds } from "./helpers";
import { ADMIN_STATE } from "./auth-state";

/**
 * Logs in once and saves the resulting cookies for every admin spec to reuse.
 *
 * Before this, each of the eight admin specs signed in from scratch in its own
 * `beforeEach` — fifteen password logins per run, several of them happening at
 * the same moment against the same account. That was intermittently failing:
 * roughly one spec per run would land back on /admin/login and the whole file
 * would go red, while passing perfectly when run on its own. Concurrent
 * sign-ins for one user are simply not something to lean on.
 *
 * Playwright's storageState is the intended answer. Authenticate once here,
 * write the cookies to disk, and let the admin project start every test already
 * signed in. Faster, and it removes the contention entirely.
 *
 * Note this is a `setup` test in its own project, so it runs to completion
 * before the admin project starts — see `dependencies` in playwright.config.ts.
 */
setup("authenticate as admin", async ({ page }) => {
  const { email, password } = adminCreds();

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Parolă").fill(password);
  await page.getByRole("button", { name: "Autentificare" }).click();

  // Proves the whole chain works: Supabase issued a session, the cookie was
  // written, and proxy.ts accepted it AND confirmed the account is on the admin
  // list. If is_admin() were wrong we would be bounced to
  // /admin/login?error=forbidden and this would fail here rather than
  // mysteriously in some unrelated spec.
  await expect(page).toHaveURL(/\/admin$/);

  await page.context().storageState({ path: ADMIN_STATE });
});
