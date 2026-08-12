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
