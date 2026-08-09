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

  // This used to assert that clicking Send without solving the CAPTCHA showed
  // "Completează verificarea de securitate." That only ever passed by accident:
  // it raced the widget, and the click happened to land before the token
  // arrived. On a slower engine the token won the race, the form submitted, and
  // the test failed. Asserting the successful path instead is both meaningful
  // and deterministic — and the CAPTCHA requirement is checked properly below,
  // at the API, where no race exists.
  test("sends a message successfully", async ({ page }) => {
    // Wait for the CAPTCHA to verify BEFORE typing, not after.
    //
    // This form is client-rendered, so its inputs are controlled by React
    // state. Typing into one before React has hydrated writes the value into
    // the DOM node, and then hydration re-renders it back to the empty string —
    // the field silently clears. On Chromium hydration wins the race and
    // nothing is noticed; on WebKit it does not, the "Nume" field ends up
    // empty, and the browser blocks submission on the `required` attribute
    // without any request being sent.
    //
    // Waiting for the widget's own verified signal proves React is running,
    // which makes the fills below stick on every engine.
    await expect(page.locator('[data-verified="true"]')).toBeAttached();

    await page.getByLabel("Nume").fill("Test E2E");
    await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
    await page.getByLabel("Subiect").fill("Subiect test");
    await page.getByLabel("Mesaj").fill("Mesaj de test E2E, suficient de lung.");

    await page.getByRole("button", { name: "Trimite" }).click();

    await expect(page.getByText("Mesajul a fost trimis cu succes!")).toBeVisible();
  });
});

test.describe("contact API guards", () => {
  // Deterministic, unlike driving the widget through the UI: the route checks
  // for the token's presence before it ever contacts Cloudflare, so there is no
  // race to lose.
  //
  // There is deliberately no "forged token is rejected" test here. The suite
  // runs with Cloudflare's always-pass test secret, which by design accepts any
  // token at all — so such a test would fail against a correctly working
  // server. Verifying real rejection needs the always-block secret
  // (2x0000000000000000000000000000000AAA), which is a whole-environment
  // setting and cannot coexist with the always-pass key in one run.
  test("rejects a submission with no captcha token", async ({ request }) => {
    const res = await request.post("/api/contact", {
      data: {
        name: "Bot",
        email: "bot@example.com",
        message: "Mesaj trimis fără verificare de securitate.",
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("Missing captcha token");
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
