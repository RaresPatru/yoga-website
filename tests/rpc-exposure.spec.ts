import { test, expect } from "@playwright/test";
import { anonStorageClient, deleteEventBySlug, seedEvent } from "./helpers";

/**
 * What PostgREST exposes to a caller holding only the publishable key.
 *
 * Every SECURITY DEFINER function in the `public` schema is reachable at
 * /rest/v1/rpc/<name> by whichever roles hold EXECUTE. That makes the function
 * ACL part of the site's attack surface, and it is the one piece of the schema
 * that `pg_dump` will not show you: Postgres grants EXECUTE to PUBLIC when a
 * function is created, and default PUBLIC grants are omitted from dumps.
 *
 * So `revoke all on function ... from anon, authenticated` reads like a lock
 * and is not one — it removes the named grants and leaves the inherited PUBLIC
 * one in place. That is exactly what happened to register_for_event, and the
 * only reason it was caught is that Supabase's linter reports reachability
 * rather than grants.
 *
 * These tests assert the refusal from the outside, over HTTP, as an anonymous
 * visitor. Asserting on `pg_proc.proacl` would prove the grant is written the
 * way we think; this proves the door is shut.
 */
test.describe("RPC exposure to anonymous callers", () => {
  test("register_for_event cannot be called with the publishable key", async () => {
    const event = await seedEvent({ price: 350, published: true });

    try {
      const anon = await anonStorageClient();
      const { data, error } = await anon.rpc("register_for_event", {
        p_event_id: event.id,
        p_full_name: "Anon Bypass",
        p_email: "bypass@test.local",
        p_phone: "+40700000000",
        // The function accepts this value — it is one of the four permitted
        // statuses — so if the call goes through at all, the caller is recorded
        // as having paid for a paid event without any payment taking place.
        p_payment_status: "completed",
      });

      // A hard refusal. PostgREST answers 404 for a function the role may not
      // execute rather than 403, because without EXECUTE the function is not
      // visible in the schema cache at all.
      expect(error, "anon must not be able to call register_for_event").not.toBeNull();
      expect(data).toBeNull();

      // And nothing reached the table.
      const { count } = await anon
        .from("registrations")
        .select("id", { count: "exact", head: true });
      expect(count ?? 0, "no registration should exist for an anon caller").toBe(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * is_admin() stays callable, and that is deliberate rather than an oversight.
   *
   * RLS policy expressions are evaluated with the caller's privileges, so every
   * role that reads a table carrying an `is_admin()` policy needs EXECUTE on
   * it. Revoking from anon would not harden anything — it would make the public
   * pages fail with "permission denied for function is_admin".
   *
   * It is safe to expose because it answers only about the caller: `auth.uid()`
   * is null for an anonymous request, so the answer is always false.
   */
  test("is_admin is callable but answers false for an anonymous caller", async () => {
    const anon = await anonStorageClient();
    const { data, error } = await anon.rpc("is_admin");

    expect(error).toBeNull();
    expect(data, "an anonymous caller is never an admin").toBe(false);
  });
});

/**
 * The whole of what the publishable key can reach, enumerated rather than
 * spot-checked.
 *
 * WHY THIS EXISTS
 *
 * The two databases disagree about default privileges. A newly created table
 * inherits `ALL` for anon, authenticated and service_role on the local stack,
 * and nothing at all in production:
 *
 *   production   GRANT REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON TABLES
 *   local        GRANT ALL ON TABLES
 *
 * So a migration that creates a table without saying anything about grants
 * produces a table anon can read and write locally, and one nobody can touch in
 * production. Both halves are bad, and neither announces itself: the local one
 * looks like it works, and the production one only fails once it is live.
 *
 * `20260905000000_revoke_default_anon_grants.sql` considered changing the
 * default and deliberately did not — it belongs to Supabase's project setup and
 * the platform may re-apply it, in which case a revoke in a migration would be
 * silently undone. This is the alternative: stop relying on the default, state
 * grants explicitly in every migration that creates a table, and let a test
 * fail the moment something reachable appears that nobody listed.
 *
 * HOW IT ASKS
 *
 * PostgREST's root endpoint returns an OpenAPI description of everything the
 * calling key may touch. Asking with the publishable key produces exactly the
 * anonymous visitor's view of the database — which is both the right question
 * and self-updating, so a new table shows up here without anyone remembering to
 * add it to a list.
 */
test.describe("the anonymous surface of the database", () => {
  /**
   * Every table an anonymous visitor may reach, and why each one is public.
   *
   * `profiles` is the odd one out: it is granted SELECT and completely unused,
   * because there is no public sign-up. It is listed rather than removed
   * because removing a grant is a schema change and this test is not the place
   * to make one — but it is the first thing to drop if that stays true.
   */
  const PUBLIC_TABLES = [
    "blog_posts", // published posts — the /blog pages
    "event_availability", // seat counts, without the registrations behind them
    "events", // published events — the /events pages
    "faqs", // the home page accordion
    "profiles", // unused; see above
    "site_content", // her copy, on every page
    "testimonials", // approved quotes only
  ];

  /**
   * Functions anon may execute. Both are deliberate and both are covered
   * individually above: `is_admin` because RLS policies evaluate it with the
   * caller's privileges, `pending_hold_interval` because the availability view
   * calls it.
   *
   * `register_for_event` must never appear here. It did once — reachable
   * through the PUBLIC grant Postgres adds at creation, which `pg_dump` does
   * not print — and booking a 350 RON retreat without paying was one HTTP
   * request.
   */
  const PUBLIC_FUNCTIONS = ["is_admin", "pending_hold_interval"];

  async function anonymousSurface() {
    // Runs the non-local database guard in helpers.ts before anything else
    // reaches for the URL.
    await anonStorageClient();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const spec = await fetch(`${url}/rest/v1/`, { headers: { apikey: key } }).then(
      (r) => r.json()
    );

    const paths = Object.keys(spec.paths ?? {}).filter((p) => p !== "/");
    return {
      tables: paths.filter((p) => !p.startsWith("/rpc/")).map((p) => p.slice(1)).sort(),
      functions: paths.filter((p) => p.startsWith("/rpc/")).map((p) => p.slice(5)).sort(),
    };
  }

  test("reaches exactly these tables and no others", async () => {
    const { tables } = await anonymousSurface();
    expect(
      tables,
      "a table nobody listed became reachable with the publishable key — if a " +
        "migration just created it, say what anon may do with it explicitly " +
        "rather than inheriting the local default of ALL"
    ).toEqual(PUBLIC_TABLES);
  });

  test("reaches exactly these functions and no others", async () => {
    const { functions } = await anonymousSurface();
    expect(
      functions,
      "a SECURITY DEFINER function became callable with the publishable key — " +
        "Postgres grants EXECUTE to PUBLIC at creation and pg_dump does not " +
        "print it, so revoking from anon alone is not enough"
    ).toEqual(PUBLIC_FUNCTIONS);
  });

  /**
   * The enumeration above proves which tables anon can reach, not what it may
   * do with them — a table granted ALL and a table granted SELECT look the same
   * in the OpenAPI description. This asks the other half of the question.
   */
  test("can read the public tables but not write to them", async () => {
    const anon = await anonStorageClient();

    // Asserts a row came back, not merely that `data` is non-null. A revoked
    // grant or a dropped policy does not raise an error here — Row Level
    // Security is a filter, so a total refusal arrives as `{ data: [], error:
    // null }`, and `[]` is not null. The old `.not.toBeNull()` therefore passed
    // in exactly the situation it existed to catch: every public page rendering
    // placeholders while the test reported the surface was fine.
    const { data: readable } = await anon.from("site_content").select("key").limit(1);
    expect(
      readable?.length ?? 0,
      "the public pages depend on this being readable — an empty result here is " +
        "a permissions failure, not an empty table"
    ).toBeGreaterThan(0);

    const { error: insertError } = await anon
      .from("site_content")
      .insert({ key: `anon-write-${Date.now()}`, section: "footer", label_ro: "x" });
    expect(insertError, "anon must not be able to insert").not.toBeNull();

    const { error: updateError } = await anon
      .from("site_content")
      .update({ value_ro: "overwritten by an anonymous caller" })
      .eq("key", "home.hero_title")
      .select();
    // RLS returning zero rows is also a refusal, so the assertion is that the
    // value did not change rather than that an error came back.
    const { data: after } = await anon
      .from("site_content")
      .select("value_ro")
      .eq("key", "home.hero_title")
      .single();
    expect(
      after?.value_ro,
      `anon must not be able to update (error was ${updateError?.message ?? "none"})`
    ).not.toBe("overwritten by an anonymous caller");
  });
});
