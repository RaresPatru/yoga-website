import { test, expect } from "@playwright/test";
import {
  createThrowawayUser,
  deleteThrowawayUser,
  grantAdmin,
  passwordWorks,
  recoveryLinkFor,
} from "./helpers";

/**
 * Password reset, end to end.
 *
 * The instructor runs this site alone. If she forgets her password there is
 * nobody to reset it for her, so this flow is the only way back in — which
 * makes it worth testing through the actual email rather than around it.
 *
 * These specs run in the `chromium` project, which starts signed out. That is
 * the state a person resetting a password is always in.
 */

// Long enough to satisfy the 15-character minimum set on both the local stack
// (supabase/config.toml) and the production project.
const NEW_PASSWORD = "corect-cal-baterie-capsator-2026";

/**
 * Waits for the forgot-password form to be able to receive a click.
 *
 * The submit handler is React's, so it does nothing until the page has
 * hydrated. Clicking before then is silently swallowed — the form has no
 * `action`, so the native submit is a no-op too — and the test sees a page that
 * simply never changed. WebKit hydrates slower than Chromium here, so this
 * failed only on the mobile project and looked like a WebKit bug in the app.
 * It was not: the same click a second later works, and the request goes out.
 *
 * The intro copy is the signal. It is rendered through `t()`, which returns the
 * raw key until the admin translations finish loading in a client effect — so
 * seeing the real sentence proves both that React is running and that the
 * messages are in, which is exactly the state a person would be clicking in.
 */
async function waitForFormReady(page: import("@playwright/test").Page) {
  await expect(
    page.getByText(/Introdu adresa de email|Enter the account email/i)
  ).toBeVisible();
}

test.describe("password reset", () => {
  test("the login page offers a way out for someone locked out", async ({
    page,
  }) => {
    await page.goto("/admin/login");

    const link = page.getByRole("link", { name: /uitat parola|forgot/i });
    await expect(link).toBeVisible();

    await link.click();
    await expect(page).toHaveURL(/\/admin\/forgot-password/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("both reset pages are reachable while signed out", async ({ page }) => {
    // The whole flow is for people who cannot sign in, so proxy.ts exempts
    // these two routes. If that exemption is ever removed the reset link will
    // bounce to the login page and look broken while being perfectly valid.
    for (const path of ["/admin/forgot-password", "/admin/reset-password"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should not redirect away`).toBe(200);
      await expect(page).toHaveURL(new RegExp(path));
    }
  });

  test("the rest of the admin panel is still protected", async ({ page }) => {
    // The guard on the guard: the exemption above is an explicit list, not a
    // prefix match, so /admin and its real pages must still bounce.
    for (const path of ["/admin", "/admin/events", "/admin/messages"]) {
      await page.goto(path);
      await expect(page, `${path} must still require a session`).toHaveURL(
        /\/admin\/login/
      );
    }
  });

  test("an unknown address gets the same answer as a real one", async ({
    page,
  }) => {
    // Account enumeration. If this page said "no such user" for an address it
    // does not know, anyone could discover which addresses have accounts by
    // submitting guesses and watching which ones are rejected.
    await page.goto("/admin/forgot-password");
    await waitForFormReady(page);
    await page
      .getByLabel("Email")
      .fill(`definitely-not-a-user-${Date.now()}@test.local`);
    await page.getByRole("button", { name: /Trimite|Send/i }).click();

    await expect(
      page.getByText(/Dacă există un cont|If an account exists/i)
    ).toBeVisible();
  });

  test("a link that carries no token refuses to show the form", async ({
    page,
  }) => {
    await page.goto("/admin/reset-password");

    await expect(
      page.getByText(/invalid sau a expirat|invalid or has expired/i)
    ).toBeVisible();
    await expect(
      page.getByLabel(/Parolă nouă|New password/i)
    ).toHaveCount(0);
  });

  test("the emailed link sets a new password and retires the old one", async ({
    page,
  }) => {
    const originalPassword = "original-passphrase-for-e2e-2026";
    const user = await createThrowawayUser(originalPassword);

    try {
      // The mailbox is deliberately not emptied first. Two browser projects run
      // this spec at once, so clearing it would let one worker delete the
      // other's email; recoveryLinkFor filters by recipient instead, and every
      // throwaway account gets a unique address.

      // Ask for the email through the real page rather than the API, so the
      // redirectTo this app actually sends is the one under test. Getting that
      // wrong is the likeliest way for this flow to break in production: an
      // origin missing from the Supabase allowlist is not an error, it is a
      // silent fallback to the project's Site URL.
      await page.goto("/admin/forgot-password");
      await waitForFormReady(page);
      await page.getByLabel("Email").fill(user.email);
      await page.getByRole("button", { name: /Trimite|Send/i }).click();

      // Wait for the confirmation copy itself, not for `role=status`. The admin
      // translations are fetched by a dynamic import in a client effect, so for
      // the first frames `t()` returns the raw key — "admin.forgot_sent" — and
      // a role-only locator can match that placeholder before the real text
      // arrives. Asserting on the sentence waits for the state that matters.
      await expect(
        page.getByText(/Dacă există un cont|If an account exists/i)
      ).toBeVisible();

      const link = await recoveryLinkFor(user.email);

      // Following it lands on /admin/reset-password with the token in the URL
      // fragment. The fragment never reaches the server, so everything from
      // here is the browser's own doing.
      await page.goto(link);
      await expect(page).toHaveURL(/\/admin\/reset-password/);

      const passwordField = page.getByLabel(/Parolă nouă|New password/i);
      await expect(passwordField).toBeVisible();

      await passwordField.fill(NEW_PASSWORD);
      await page.getByLabel(/Confirmă|Confirm/i).fill(NEW_PASSWORD);
      await page.getByRole("button", { name: /Salvează|Save/i }).click();

      await expect(
        page.getByText(/Parola a fost schimbată|password has been changed/i)
      ).toBeVisible();

      // The token is single-use and the page strips it from the address bar, so
      // neither the history entry nor a Referer header carries it onward.
      expect(page.url()).not.toContain("access_token");

      expect(
        await passwordWorks(user.email, NEW_PASSWORD),
        "the new password should sign in"
      ).toBe(true);

      expect(
        await passwordWorks(user.email, originalPassword),
        "the old password must stop working"
      ).toBe(false);

      // The link is spent, and must look spent.
      //
      // Supabase consumes the token on first use — a fresh browser following
      // the same link is refused. But completing a reset leaves *this* browser
      // holding the session that link created, and the page used to treat any
      // session as permission to show the form. So the reset page stayed usable
      // for as long as that session lived: the password could be changed again
      // and again, with no new email, from a link that had already been used.
      //
      // Both halves are checked, because they failed for different reasons and
      // could regress separately.
      await page.goto(link);
      await expect(
        page.getByText(/invalid sau a expirat|invalid or has expired/i),
        "re-following a spent link must be refused"
      ).toBeVisible();

      await page.goto("/admin/reset-password");
      await expect(
        page.getByText(/invalid sau a expirat|invalid or has expired/i),
        "the page must not be reusable after a completed reset"
      ).toBeVisible();
    } finally {
      await deleteThrowawayUser(user.id);
    }
  });

  test("a signed-in admin is not offered the form without a link", async ({
    page,
  }) => {
    // A session is not permission to set a new password here.
    //
    // Supabase exempts a *recovery* session from the project's "Require current
    // password when updating" rule — clicking a link sent to the account's
    // mailbox is the proof. An ordinary session gets no exemption, so an admin
    // who opened this page directly hit
    // "Current password required when setting new password" in production while
    // every local test passed, because that setting has no equivalent in
    // supabase/config.toml and cannot be reproduced here.
    //
    // The error was Supabase catching what this page should not have offered:
    // with the setting off, the same form would have let anyone at an unlocked,
    // already-signed-in browser change the password without knowing the old
    // one. This asserts the rule the page now enforces, which holds regardless
    // of how the project is configured.
    const password = "original-passphrase-for-e2e-2026";
    const user = await createThrowawayUser(password);

    try {
      await grantAdmin(user.id, user.email);

      await page.goto("/admin/login");
      await expect(page.getByLabel("Parolă")).toBeVisible();
      await page.getByLabel("Email").fill(user.email);
      await page.getByLabel("Parolă").fill(password);
      await page.getByRole("button", { name: /Autentificare|Login/i }).click();
      await expect(page).toHaveURL(/\/admin$/);

      await page.goto("/admin/reset-password");

      await expect(
        page.getByText(/invalid sau a expirat|invalid or has expired/i),
        "a signed-in visitor with no recovery link must be refused"
      ).toBeVisible();
      await expect(page.getByLabel(/Parolă nouă|New password/i)).toHaveCount(0);
    } finally {
      await deleteThrowawayUser(user.id);
    }
  });

  test("signing in on another tab does not reopen the finished form", async ({
    page,
    context,
  }) => {
    // Reported from production, and reproducible only with two tabs in the
    // *same* browser — two Playwright contexts do not share cookies, which is
    // why the first version of this suite never saw it.
    //
    // The reset page keeps its auth listener subscribed while mounted, and the
    // Supabase browser client syncs sessions between tabs. Signing in anywhere
    // else therefore fired SIGNED_IN inside the completed page, which flipped
    // back to its form with the typed password still in React state — against
    // an ordinary session, which is not what the form is for. Supabase refused
    // the submission, and that refusal was the only thing making it harmless.
    const originalPassword = "original-passphrase-for-e2e-2026";
    const user = await createThrowawayUser(originalPassword);

    try {
      await grantAdmin(user.id, user.email);

      await page.goto("/admin/forgot-password");
      await waitForFormReady(page);
      await page.getByLabel("Email").fill(user.email);
      await page.getByRole("button", { name: /Trimite|Send/i }).click();
      await expect(
        page.getByText(/Dacă există un cont|If an account exists/i)
      ).toBeVisible();

      await page.goto(await recoveryLinkFor(user.email));
      const field = page.getByLabel(/Parolă nouă|New password/i);
      await expect(field).toBeVisible();
      await field.fill(NEW_PASSWORD);
      await page.getByLabel(/Confirmă|Confirm/i).fill(NEW_PASSWORD);
      await page.getByRole("button", { name: /Salvează|Save/i }).click();
      await expect(
        page.getByText(/Parola a fost schimbată|password has been changed/i)
      ).toBeVisible();

      // A second tab in the same browser, signing in with the new password.
      const secondTab = await context.newPage();
      await secondTab.goto("/admin/login");
      await expect(secondTab.getByLabel("Parolă")).toBeVisible();
      await secondTab.getByLabel("Email").fill(user.email);
      await secondTab.getByLabel("Parolă").fill(NEW_PASSWORD);
      await secondTab
        .getByRole("button", { name: /Autentificare|Login/i })
        .click();
      await expect(secondTab).toHaveURL(/\/admin$/);

      // The finished tab must not have changed underneath.
      await page.bringToFront();
      await expect(
        page.getByText(/Parola a fost schimbată|password has been changed/i),
        "the completed page must stay completed"
      ).toBeVisible();
      await expect(
        page.getByLabel(/Parolă nouă|New password/i),
        "the form must not come back"
      ).toHaveCount(0);

      await secondTab.close();
    } finally {
      await deleteThrowawayUser(user.id);
    }
  });

  test("a reset locks out an admin who was already signed in elsewhere", async ({
    page,
    browser,
    baseURL,
  }) => {
    // The point of resetting a password is usually that somebody else may know
    // it. If the sessions that already exist survive the reset, it achieves
    // nothing against the threat that prompted it — the other device keeps its
    // refresh token and carries on.
    //
    // `signOut({ scope: "global" })` on the reset page is what closes that, and
    // proxy.ts is what makes it immediate: it calls getUser() on every /admin
    // request, which revalidates against Supabase rather than trusting the
    // cookie, so a revoked session is refused on the very next navigation
    // instead of lingering until the access token expires.
    const originalPassword = "original-passphrase-for-e2e-2026";
    const user = await createThrowawayUser(originalPassword);
    const elsewhere = await browser.newContext({ baseURL });

    try {
      await grantAdmin(user.id, user.email);

      // The other device: signed in, sitting on the dashboard.
      const otherPage = await elsewhere.newPage();
      await otherPage.goto("/admin/login");
      await expect(otherPage.getByLabel("Parolă")).toBeVisible();
      await otherPage.getByLabel("Email").fill(user.email);
      await otherPage.getByLabel("Parolă").fill(originalPassword);
      await otherPage.getByRole("button", { name: /Autentificare|Login/i }).click();
      await expect(otherPage).toHaveURL(/\/admin$/);

      // This device: reset the password.
      await page.goto("/admin/forgot-password");
      await waitForFormReady(page);
      await page.getByLabel("Email").fill(user.email);
      await page.getByRole("button", { name: /Trimite|Send/i }).click();
      await expect(
        page.getByText(/Dacă există un cont|If an account exists/i)
      ).toBeVisible();

      await page.goto(await recoveryLinkFor(user.email));
      const field = page.getByLabel(/Parolă nouă|New password/i);
      await expect(field).toBeVisible();
      await field.fill(NEW_PASSWORD);
      await page.getByLabel(/Confirmă|Confirm/i).fill(NEW_PASSWORD);
      await page.getByRole("button", { name: /Salvează|Save/i }).click();
      await expect(
        page.getByText(/Parola a fost schimbată|password has been changed/i)
      ).toBeVisible();

      // The other device's next move must land on the login page.
      await otherPage.goto("/admin");
      await expect(
        otherPage,
        "the session that was already open must be refused"
      ).toHaveURL(/\/admin\/login/);
    } finally {
      await elsewhere.close();
      await deleteThrowawayUser(user.id);
    }
  });
});
