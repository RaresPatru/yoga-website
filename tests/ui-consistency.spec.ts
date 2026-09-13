import { test, expect, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  seedEvent,
  deleteEventBySlug,
  seedPost,
  deletePostBySlug,
  seedRegistrationFor,
  seedTestimonial,
  deleteTestimonial,
  siteContentValue,
  setSiteContent,
} from "./helpers";

/**
 * The visual rules that are easy to break by accident, and were.
 *
 * Each of these started as something visible on the live site that nobody had
 * written down, so nothing stopped the next component from doing it again.
 */

/** --color-rose-deep, #A94E67. The one focus colour on the site. */
const ROSE_DEEP = "rgb(169, 78, 103)";

const PUBLIC_PAGES = ["/ro", "/ro/blog", "/ro/events", "/ro/testimonials", "/ro/contact"];

test.describe("focus is visible, and is the same everywhere", () => {
  /**
   * THE BUG THIS CATCHES
   *
   * Nine different focus treatments had accumulated: three ring colours across
   * four opacities, an inset variant, two elements that set a ring colour with
   * no ring width, and two that removed the browser outline and put nothing
   * back. Everything else — every nav link, every card, the footer icons, the
   * whole admin sidebar — had no focus style at all and fell through to the
   * browser's own black outline. That black ring on a warm cream page is what
   * got reported, and it was the absence of a style rather than a style.
   *
   * One `:where()` rule in globals.css now covers the lot. This asserts the
   * outcome rather than the rule, so it keeps working however the rule is
   * written.
   *
   * WHY IT FOCUSES EACH CONTROL INSTEAD OF PRESSING TAB
   *
   * Tab does not walk links in WebKit — Safari ships "press Tab to highlight
   * each item" switched off, and on an iPhone there is no Tab key at all.
   * Measured on the mobile project, eight presses produced only
   * BUTTON / BODY and never a single <a>, so a tab-walk silently tests almost
   * nothing on the engine most of this audience actually uses.
   *
   * Moving focus in script does work on both engines, and both then report
   * `:focus-visible` as matching — the heuristic treats programmatic focus on a
   * freshly loaded page as keyboard focus. Asserting that match before reading
   * the outline is what keeps this honest: if a browser ever stopped, the
   * control is skipped rather than passed.
   */
  for (const path of PUBLIC_PAGES) {
    test(`every control on ${path} shows the rose outline`, async ({ page }) => {
      await page.goto(path);

      // Tailwind v4 put `outline-color` into `transition-colors`, so a control
      // read the instant it gains focus is still somewhere between currentColor
      // and rose. Freezing transitions is faster and steadier than sleeping
      // through each one.
      await page.addStyleTag({
        content: "*, *::before, *::after { transition: none !important; }",
      });

      const result = await page.evaluate((rose) => {
        const controls = [
          ...document.querySelectorAll<HTMLElement>(
            "a[href], button, summary, input, textarea, select"
          ),
        ].filter((el) => el.offsetParent !== null || el.tagName === "SUMMARY");

        const offenders: string[] = [];
        let checked = 0;

        for (const el of controls) {
          el.focus();
          if (document.activeElement !== el) continue;
          if (!el.matches(":focus-visible")) continue;

          checked++;
          const cs = getComputedStyle(el);
          const name =
            el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 30);
          if (
            cs.outlineColor !== rose ||
            parseFloat(cs.outlineWidth) < 2 ||
            cs.outlineStyle !== "solid"
          ) {
            offenders.push(
              `${el.tagName.toLowerCase()} "${name}" -> ${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`
            );
          }
        }
        return { offenders, checked, total: controls.length };
      }, ROSE_DEEP);

      // Vacuity guards, both needed and neither a magic number. A page that
      // rendered no controls at all, or one where the browser refused to treat
      // any of them as keyboard-focused, would otherwise pass with an empty
      // offender list and prove nothing.
      //
      // Not a minimum count: how many controls a page has depends on the
      // viewport and on what content exists. /ro/testimonials on a phone has
      // three — the skip link, the wordmark and the menu button — because the
      // navigation is behind the hamburger and the footer icons only exist once
      // she has filled in a social address.
      expect(result.total, "this page rendered no focusable controls").toBeGreaterThan(0);
      expect(
        result.checked,
        `none of this page's ${result.total} controls reported :focus-visible`
      ).toBeGreaterThan(0);
      expect(result.offenders, "controls without the site's focus outline").toEqual([]);
    });
  }

  test("a focused card outline follows the card's rounded shape", async ({ page }) => {
    const post = await seedPost();
    try {
      await page.goto("/ro/blog");
      const link = page.locator(`a[href$="/blog/${post.slug}"]`);
      await link.focus();
      // The outline is drawn on the <a>, and an outline follows the radius of
      // the element it belongs to. While the <a> had none, a rounded card got a
      // hard square box drawn around it — which is what made the default
      // outline look so wrong on this site in particular.
      await expect(link).toHaveCSS("border-top-left-radius", "16px");
    } finally {
      await deletePostBySlug(post.slug);
    }
  });
});

test.describe("cards animate the same way everywhere", () => {
  /**
   * THE BUG THIS CATCHES
   *
   * GlassCard already animates itself. Five public call sites also passed
   * `transition-transform hover:scale-[1.02]` through `className`, and because
   * Tailwind v4 compiles `scale-*` to the individual `scale` property — which
   * multiplies with `transform` rather than replacing it — the card grew to
   * 1.0404, took about a second to settle instead of a quarter of one, and lost
   * its eased shadow entirely.
   */
  test("no GlassCard is handed its own transform classes", () => {
    // Structural, and deliberately not a browser test: it fails the moment
    // somebody adds one back, rather than waiting for a person to notice that a
    // card feels wrong.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.name.endsWith(".tsx") ? [full] : [];
      });

    // Both directories. Four call sites live under components/ — the media
    // library, the WhatsApp field and two in the registration panel — and a
    // guard that only reads app/ would have let any of them reintroduce this.
    const files = [
      ...walk(join(process.cwd(), "app")),
      ...walk(join(process.cwd(), "components")),
    ];

    // Everything between `<GlassCard` and the `>` that ends the opening tag,
    // which is where props live. Stopping at that `>` is what keeps the card's
    // own children out of it: the event photograph legitimately carries
    // `motion-safe:group-hover:scale-105`, and that is the zoom, not the card.
    const openingTag = /<GlassCard\b[^>]*/g;

    // Matched against the whole props blob rather than inside a quoted string.
    // The old version required a literal `className="…"`, so the most natural
    // way to write the bug — `className={cn("transition-transform", …)}` —
    // sailed straight past it. A className held in a variable still would; that
    // is the limit of reading source as text, and the browser assertions below
    // are the backstop for it.
    const offenders = files.filter((file) =>
      (readFileSync(file, "utf8").match(openingTag) ?? []).some((tag) =>
        /transition-transform|hover:scale-/.test(tag)
      )
    );

    expect(
      offenders.map((f) => f.replace(process.cwd(), "")),
      "GlassCard animates itself — see the note at the top of components/ui/glass-card.tsx"
    ).toEqual([]);
  });

  // Hover is a pointer state. The mobile project is an iPhone, where it does not
  // exist, so asserting it there would be asserting something that cannot happen.
  test.describe("on a pointer device", () => {
    test.skip(({ isMobile }) => Boolean(isMobile), "hover does not exist on touch");

    test("a hovered card grows to 1.02 and does not overshoot", async ({ page }) => {
      const post = await seedPost();
      try {
        await page.goto("/ro/blog");
        const link = page.locator(`a[href$="/blog/${post.slug}"]`);
        const card = link.locator("> div").first();

        // box-shadow, not transform. `transition-transform` replaces this value
        // rather than adding to it, which is what silently stopped the shadow
        // easing on every public card.
        await expect(card).toHaveCSS("transition-property", "box-shadow");

        // Record the scale every animation frame for the whole hover, because
        // the peak is the thing under test and it is gone within 300ms.
        const peak = card.evaluate(
          (el) =>
            new Promise<number>((resolve) => {
              let highest = 1;
              const started = performance.now();
              const sample = () => {
                const cs = getComputedStyle(el);
                // Both, multiplied. The individual `scale` property does not
                // override `transform`, so a stray Tailwind `hover:scale-*`
                // would show up here as ~1.04 rather than 1.02.
                const individual = cs.scale === "none" ? 1 : parseFloat(cs.scale);
                highest = Math.max(highest, new DOMMatrix(cs.transform).a * individual);
                if (performance.now() - started < 900) requestAnimationFrame(sample);
                else resolve(Math.round(highest * 10000) / 10000);
              };
              requestAnimationFrame(sample);
            })
        );
        await card.hover();

        /**
         * THE RULE THIS PROTECTS
         *
         * Scaling a card scales its text — a blog date grows 2.8px, an event
         * description 6.7px — and that is accepted. What is not accepted is the
         * text stretching *past* its final width and springing back, which is
         * what "bouncing in place" meant when it was reported from the live
         * site. That was a spring with a damping ratio of 0.58 overshooting by
         * 10.8%.
         *
         * The bound needs care, because overshoot is a percentage of the
         * TRAVEL, not of the final value, and the travel here is only 0.02:
         *
         *   zeta 0.87 -> 0.43%  of 0.02 = 0.00009  -> peaks at 1.0201
         *   zeta 0.58 -> 10.8%  of 0.02 = 0.00216  -> peaks at 1.0222
         *
         * So the two cases are 0.002 apart, and a bound of 1.025 — the first
         * one written here — sat above both and caught nothing. 1.021 splits
         * them: it clears the real peak by 0.001 and fails the bouncy one by
         * the same. Checked in both directions rather than reasoned about.
         */
        expect(await peak, "the hover must not overshoot into a visible bounce")
          .toBeLessThan(1.021);

        await expect
          .poll(
            () =>
              card.evaluate((el) => {
                const cs = getComputedStyle(el);
                const individual = cs.scale === "none" ? 1 : parseFloat(cs.scale);
                return Math.round(new DOMMatrix(cs.transform).a * individual * 1000) / 1000;
              }),
            { message: "the settled hover scale", timeout: 5000 }
          )
          .toBe(1.02);
      } finally {
        await deletePostBySlug(post.slug);
      }
    });

    test("hovering an event card zooms its photograph", async ({ page }) => {
      const event = await seedEvent({ image_url: "/flags/RO.svg" });
      try {
        await page.goto("/ro/events");
        const card = page.locator(`a[href$="/events/${event.slug}"]`);
        const image = card.locator("img").first();

        await expect(image).toHaveCSS("scale", "1");
        await card.hover();
        await expect
          .poll(() => image.evaluate((el) => getComputedStyle(el).scale), {
            message: "the image scale after hovering the card",
            timeout: 5000,
          })
          .toBe("1.05");
      } finally {
        await deleteEventBySlug(event.slug);
      }
    });
  });
});

test.describe("the authorisation root stays out of reach", () => {
  /**
   * WHAT THIS PROTECTS, AND WHY IT IS IN A TEST RATHER THAN A COMMENT
   *
   * `admins` decides who may enter /admin. It has no grants for anon or
   * authenticated, no RLS policies at all, and since
   * 20260912000000_converge_role_grants.sql no grants for service_role either —
   * so in production nothing reaches it through the API. Only the `postgres`
   * superuser and the security-definer `is_admin()` can see it. The point is
   * that a leaked service key gets every row of every other table but still
   * cannot write itself into the list that grants admin access.
   *
   * The local database is deliberately one privilege looser: supabase/seed.sql
   * grants service_role insert, because the password-reset specs create a
   * throwaway administrator per test. That exception is only safe while no
   * application code depends on reading or writing this table — the moment some
   * does, it works locally and fails live, which is the exact failure this
   * repository has shipped twice.
   *
   * So the rule is enforced rather than remembered.
   */
  test("no application code reads or writes the admins table", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
      });

    // The root of the repository as well as the three source directories.
    // `proxy.ts` sits there, it is one of the two files that authorises a
    // request, and it was invisible to this guard while the walk only descended
    // into app/, lib/ and components/ — as would be anything else Next expects
    // at the root, `instrumentation.ts` among them.
    const rootFiles = readdirSync(process.cwd(), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
      .map((entry) => join(process.cwd(), entry.name));

    const offenders = [
      ...rootFiles,
      ...["app", "lib", "components"].flatMap((dir) => walk(join(process.cwd(), dir))),
    ].filter((file) => /from\(\s*["'`]admins["'`]\s*\)/.test(readFileSync(file, "utf8")));

    expect(
      offenders.map((f) => f.replace(process.cwd(), "")),
      "authorise through the is_admin() RPC, not by querying the table — see the note above"
    ).toEqual([]);
  });
});

test.describe("seats and ratings say the same thing wherever they appear", () => {
  /**
   * Both of these are shared components rather than markup repeated per page —
   * `components/events/seat-count.tsx` and `components/ui/rating.tsx` — because
   * the previous arrangement had each page carrying its own copy and the copies
   * had already drifted. The seat count existed on the home page and not on the
   * events index at all; the rating existed on the testimonials page only.
   *
   * Proving the component proves every page that uses it, which is the point of
   * extracting it.
   */

  test("a full event says so, and an uncapped one says nothing", async ({ page }) => {
    const full = await seedEvent({ max_participants: 1 });
    const uncapped = await seedEvent({ max_participants: null });
    try {
      await seedRegistrationFor(full.id);
      await page.goto("/ro/events");

      const fullCard = page.locator(`a[href$="/events/${full.slug}"]`);
      await expect(fullCard).toContainText("Complet");

      // Not "unlimited seats left", which is not information — it is noise on
      // every card that has no limit.
      const uncappedCard = page.locator(`a[href$="/events/${uncapped.slug}"]`);
      await expect(uncappedCard).toBeVisible();
      await expect(uncappedCard).not.toContainText(/locuri|Complet/);
    } finally {
      await deleteEventBySlug(full.slug);
      await deleteEventBySlug(uncapped.slug);
    }
  });

  test("a seat count counts down", async ({ page }) => {
    const event = await seedEvent({ max_participants: 5 });
    try {
      await page.goto("/ro/events");
      await expect(page.locator(`a[href$="/events/${event.slug}"]`)).toContainText(
        "5 locuri libere"
      );

      await seedRegistrationFor(event.id);
      await page.goto("/ro/events");
      await expect(page.locator(`a[href$="/events/${event.slug}"]`)).toContainText(
        "4 locuri libere"
      );
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * THE RULE THIS PROTECTS
   *
   * The original site drew five filled stars above every quote from a hardcoded
   * array, on a table that had no rating column. A rating that was never given
   * must render nothing — five default stars devalue the genuine reviews beside
   * them, and a page where everything is five stars is a page nobody believes.
   */
  test("a rating is drawn only when one was actually given", async ({ page }) => {
    const rated = await seedTestimonial(true, { rating: 4 });
    const unrated = await seedTestimonial(true, { rating: null });
    try {
      await page.goto("/ro/testimonials");

      // Scoped to the card element, not `div`. Matching every div on the page and
      // filtering by text made Playwright resolve thousands of handles and run
      // the browser process out of memory.
      const ratedCard = page.locator(".backdrop-blur-xl").filter({ hasText: rated.content });
      // One accessible name for the group, not five icons each announcing
      // "star". A screen reader says "4 din 5 stele" and moves on.
      await expect(ratedCard.getByRole("img", { name: "4 din 5 stele" })).toBeVisible();

      const unratedCard = page.locator(".backdrop-blur-xl").filter({ hasText: unrated.content });
      await expect(unratedCard.getByRole("img", { name: /din 5 stele/ })).toHaveCount(0);
    } finally {
      await deleteTestimonial(rated);
      await deleteTestimonial(unrated);
    }
  });
});

test.describe("the footer opens her actual accounts", () => {
  /**
   * THE BUG THIS CATCHES
   *
   * Both icons were a hardcoded `href="#"` while the admin panel had a field
   * for the Instagram address that no component ever read — a section in her
   * content screen that genuinely did nothing.
   *
   * The normalising matters as much as the wiring. `instagram.com/nume` in an
   * href is a *relative* path: the browser resolves it against this site and
   * the link 404s on our own domain, having looked correctly typed the whole
   * time.
   */
  /**
   * These two mutate rows that the whole site reads, so they cannot overlap —
   * with each other, or with the same file running under a second project.
   *
   * `site_content` has one row per key and it is seeded rather than created, so
   * unlike an event or a post there is no per-test copy to work on. Running
   * chromium and mobile at once had each test reading the other's writes, which
   * showed up as a flake that only ever failed on the last assertion.
   *
   * Restricting to one engine costs nothing here: what is under test is
   * server-rendered HTML and a pure string function, neither of which can
   * differ by browser. The engine-sensitive parts of the footer — layout,
   * focus — are covered above on both.
   */
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => Boolean(isMobile), "mutates globally shared content");

  const KEYS = ["contact.instagram_url", "contact.facebook_url"] as const;
  let original: string[] = [];

  test.beforeAll(async () => {
    original = await Promise.all(KEYS.map(siteContentValue));
  });

  test.afterAll(async () => {
    await Promise.all(KEYS.map((key, i) => setSiteContent(key, original[i])));
  });

  /**
   * Re-navigates on every poll.
   *
   * Next's dev server keeps a short-lived cache of Server Component fetches, so
   * a single reload is not always enough to see a value written a moment ago —
   * re-requesting until it lands is what makes this steady in both dev and a
   * production build.
   *
   * It uses `/ro/testimonials` rather than `/ro` only because the footer is
   * identical on every page and this one carries less above it. The reason
   * originally given — that `/ro` sets `revalidate = 300` and would serve the
   * old value from an ISR cache — was wrong: `next build` reports every route in
   * this app as server-rendered on demand, so there is no such cache to avoid.
   * See the note on `revalidate` in app/[locale]/page.tsx.
   */
  async function footerLinks(page: Page): Promise<string[]> {
    await page.goto("/ro/testimonials");
    return page.locator("footer a").evaluateAll((links) =>
      links.map((a) => `${a.getAttribute("aria-label")} ${a.getAttribute("href")}`)
    );
  }

  test("a handle, a bare domain and a full address all become working links", async ({ page }) => {
    await setSiteContent("contact.instagram_url", "@raluca.yoga");
    await setSiteContent("contact.facebook_url", "facebook.com/raluca.yoga");

    await expect.poll(() => footerLinks(page), { timeout: 20_000 }).toEqual([
      "Instagram https://www.instagram.com/raluca.yoga",
      "Facebook https://facebook.com/raluca.yoga",
    ]);

    // Opening somebody else's site in a new tab without `noopener` leaves that
    // tab able to reach back into this one through window.opener.
    for (const label of ["Instagram", "Facebook"]) {
      const link = page.locator(`footer a[aria-label="${label}"]`);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }

    await setSiteContent("contact.instagram_url", "https://www.instagram.com/altcineva/");
    await expect
      .poll(() => footerLinks(page), { timeout: 20_000 })
      .toContain("Instagram https://www.instagram.com/altcineva/");
  });

  test("an icon with no address behind it is not rendered at all", async ({ page }) => {
    await setSiteContent("contact.instagram_url", "@raluca.yoga");
    await setSiteContent("contact.facebook_url", "");

    // Not "present but inert" — absent. A social button that looks live and goes
    // nowhere tells a visitor something untrue about the business, which is the
    // same failure as an invented statistic.
    await expect
      .poll(() => footerLinks(page), { timeout: 20_000 })
      .toEqual(["Instagram https://www.instagram.com/raluca.yoga"]);

    await setSiteContent("contact.instagram_url", "");
    await expect.poll(() => footerLinks(page), { timeout: 20_000 }).toEqual([]);
  });
});
