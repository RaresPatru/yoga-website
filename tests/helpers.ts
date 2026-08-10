import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let scoped: SupabaseClient | null = null;

/**
 * Refuses to run the test suite against the production database.
 *
 * These helpers create and DELETE events, blog posts, testimonials and
 * registrations. Pointed at the live project — which is exactly what they used
 * to do — a failed cleanup leaves debris on the real website (leftover test
 * posts were visible on the live homepage), and a bug in a delete could remove
 * a real event along with the people registered for it, because
 * `registrations.event_id` cascades on delete.
 *
 * The guard is deliberately a hard crash rather than a warning. A warning in a
 * scrolling test log is a warning nobody reads.
 *
 * Set SUPABASE_ALLOW_NON_LOCAL_TESTS=true only if you consciously want to run
 * against a remote *staging* project — never production.
 */
function assertSafeDatabase(url: string): void {
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
  if (isLocal) return;

  if (process.env.SUPABASE_ALLOW_NON_LOCAL_TESTS === "true") {
    console.warn(
      `[tests] Running against a REMOTE database (${url}). Data will be created and deleted there.`
    );
    return;
  }

  throw new Error(
    `Refusing to run tests against a non-local database.\n\n` +
      `  Target: ${url}\n\n` +
      `These tests seed and delete rows. Start the local stack first:\n` +
      `  npx supabase start\n` +
      `then point the test env at it (see .env.test.example).\n\n` +
      `To override deliberately, set SUPABASE_ALLOW_NON_LOCAL_TESTS=true.`
  );
}

async function adminScoped(): Promise<SupabaseClient> {
  if (scoped) return scoped;
  const { email, password } = adminCreds();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase URL / publishable key missing in .env");

  assertSafeDatabase(url);

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`helper auth failed: ${error.message}`);
  await client.auth.setSession(data.session);
  scoped = client;
  return client;
}

/**
 * Service-role client, mirroring what the app's API routes use.
 *
 * Some tables (registrations, waiting_list) are written only by server routes
 * holding the secret key, so seeding them through the logged-in admin client
 * would hit different RLS rules than production does. Using the same role here
 * keeps the tests honest.
 *
 * Goes through the same safety guard — this client bypasses RLS entirely, so it
 * is the most dangerous one to have pointed at production.
 */
async function serviceClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
  assertSafeDatabase(url);

  const { createAdminClient } = await import("../lib/supabase/admin");
  return createAdminClient();
}

/**
 * The admin's access token, for calling admin-only API routes directly.
 *
 * The browser sends this as `Authorization: Bearer <token>`; lib/is-admin.ts
 * verifies it and then checks the account is on the admin list.
 */
export async function adminAccessToken(): Promise<string> {
  const client = await adminScoped();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("admin session has no access token");
  return token;
}

/** Browser-style client for uploading with a signed URL, as the admin UI does. */
export async function anonStorageClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  assertSafeDatabase(url);
  return createClient(url, key);
}

export function unique(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function adminCreds(): { email: string; password: string } {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD missing in .env.local");
  }
  return { email, password };
}

export async function loginAsAdmin(page: Page) {
  const { email, password } = adminCreds();
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Parolă").fill(password);
  await page.getByRole("button", { name: "Autentificare" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Deconectare" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
}

export interface SeededEvent {
  id: string;
  slug: string;
}

export async function seedEvent(overrides: Record<string, unknown> = {}): Promise<SeededEvent> {
  const slug = unique("eveniment-e2e");
  const row = {
    slug,
    title_ro: `Eveniment E2E ${slug}`,
    title_en: `E2E Event ${slug}`,
    description_ro: "<p>Descriere de test E2E.</p>",
    description_en: "<p>E2E test description.</p>",
    date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    time: "10:00",
    location: "Cluj-Napoca",
    price: 0,
    max_participants: 10,
    published: true,
    ...overrides,
  };
  const { data, error } = await (await adminScoped()).from("events").insert(row).select("id, slug").single();
  if (error) throw new Error(`seedEvent failed: ${error.message}`);
  return data as SeededEvent;
}

/**
 * Insert an event row directly and hand back whatever the database said.
 *
 * Unlike seedEvent this does not throw on failure — the point is to assert that
 * a write *is* rejected, which is the only way to test a CHECK constraint.
 */
export async function tryInsertEvent(
  overrides: Record<string, unknown> = {}
): Promise<{ error: { message: string } | null; slug: string }> {
  const slug = unique("eveniment-guard");
  const { error } = await (await adminScoped()).from("events").insert({
    slug,
    title_ro: `Guard ${slug}`,
    date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    time: "10:00",
    price: 0,
    published: false,
    ...overrides,
  });
  return { error, slug };
}

/** Read back a seeded event, for asserting on columns the UI does not show. */
export async function eventsBySlug(slug: string) {
  const { data } = await (await adminScoped())
    .from("events")
    .select("id, slug, price, currency, max_participants")
    .eq("slug", slug);
  return data ?? [];
}

/** Tidy up a saved WhatsApp link created by a test. */
export async function deleteWhatsappLink(label: string) {
  await (await adminScoped()).from("whatsapp_links").delete().eq("label", label);
}

export async function deleteEventBySlug(slug: string) {
  const { error } = await (await adminScoped()).from("events").delete().eq("slug", slug);
  if (error) throw new Error(`deleteEventBySlug failed: ${error.message}`);
}

export interface SeededPost {
  id: string;
  slug: string;
}

export async function seedPost(overrides: Record<string, unknown> = {}): Promise<SeededPost> {
  const slug = unique("articol-e2e");
  const row = {
    slug,
    title_ro: `Articol E2E ${slug}`,
    title_en: `E2E Post ${slug}`,
    content_ro: "<p>Conținut de test E2E.</p><h2>Secțiune test</h2>",
    content_en: "<p>E2E test content.</p>",
    published: true,
    hidden: false,
    ...overrides,
  };
  const { data, error } = await (await adminScoped()).from("blog_posts").insert(row).select("id, slug").single();
  if (error) throw new Error(`seedPost failed: ${error.message}`);
  return data as SeededPost;
}

export async function deletePostBySlug(slug: string) {
  const { error } = await (await adminScoped()).from("blog_posts").delete().eq("slug", slug);
  if (error) throw new Error(`deletePostBySlug failed: ${error.message}`);
}

export interface SeededTestimonial {
  id: string;
  eventId: string;
  content: string;
}

export async function seedTestimonial(approved: boolean, overrides: Record<string, unknown> = {}): Promise<SeededTestimonial> {
  const event = await seedEvent({ published: false, title_ro: unique("eveniment-testimoniu") });
  const content = `Testimonial E2E ${unique("t")}`;
  const row = {
    content,
    type: "text",
    approved,
    event_id: event.id,
    ...overrides,
  };
  const { data, error } = await (await adminScoped()).from("testimonials").insert(row).select("id").single();
  if (error) {
    await deleteEventBySlug(event.slug);
    throw new Error(`seedTestimonial failed: ${error.message}`);
  }
  return { id: (data as { id: string }).id, eventId: event.id, content };
}

export async function deleteTestimonial(seeded: SeededTestimonial) {
  const { error } = await (await adminScoped()).from("testimonials").delete().eq("id", seeded.id);
  if (error) throw new Error(`deleteTestimonial failed: ${error.message}`);
  const { error: eventError } = await (await adminScoped()).from("events").delete().eq("id", seeded.eventId);
  if (eventError) throw new Error(`deleteTestimonial event cleanup failed: ${eventError.message}`);
}

export interface SeededRegistration {
  id: string;
  eventSlug: string;
  fullName: string;
  email: string;
}

export async function seedRegistration(): Promise<SeededRegistration> {
  const event = await seedEvent();
  const fullName = `Persoana E2E ${unique("p")}`;
  const email = `e2e-${unique("m")}@example.com`;
  const row = {
    event_id: event.id,
    full_name: fullName,
    email,
    phone: "+40721112233",
    payment_status: "free",
  };
  const { data, error } = await (await serviceClient())
    .from("registrations")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    await deleteEventBySlug(event.slug);
    throw new Error(`seedRegistration failed: ${error.message}`);
  }
  return { id: (data as { id: string }).id, eventSlug: event.slug, fullName, email };
}

/**
 * Fills a seat on an existing event, so a test can drive an event to capacity
 * without registering through the UI several times.
 *
 * Uses the service key because that is what /api/register uses — the same role,
 * so the same RLS rules apply as in production.
 */
export async function seedRegistrationFor(eventId: string, overrides: Record<string, unknown> = {}) {
  const row = {
    event_id: eventId,
    full_name: `Participant E2E ${unique("p")}`,
    email: `seat-${unique("m")}@example.com`,
    phone: "+40721112233",
    payment_status: "free",
    ...overrides,
  };
  const { data, error } = await (await serviceClient())
    .from("registrations")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(`seedRegistrationFor failed: ${error.message}`);
  return (data as { id: string }).id;
}

/**
 * Adds someone to an event's waiting list.
 *
 * `claimWindow` mirrors what the Stripe webhook does when a seat frees up: it
 * stamps `notified_at` and `claim_expires_at` onto the entry, which is what
 * turns the entry's id into a usable claim token.
 *
 *   "none"    never notified — the id should not work as a claim token
 *   "open"    notified, still inside the 24h window
 *   "expired" notified, but the window has closed
 */
/** Reads an event's registrations, for asserting on payment state. */
export async function registrationsFor(
  eventId: string
): Promise<Array<{ id: string; payment_status: string }>> {
  const { data, error } = await (await serviceClient())
    .from("registrations")
    .select("id, payment_status")
    .eq("event_id", eventId);
  if (error) throw new Error(`registrationsFor failed: ${error.message}`);
  return (data ?? []) as Array<{ id: string; payment_status: string }>;
}

export async function seedWaitingEntry(
  eventId: string,
  claimWindow: "none" | "open" | "expired" = "none"
) {
  const now = Date.now();
  // Annotated rather than inferred: without the explicit type TypeScript widens
  // the ternary into a union where the "none" branch types both fields as
  // `undefined`, and the insert call then rejects the populated branch.
  const windowFields: { notified_at?: string; claim_expires_at?: string } = {};
  if (claimWindow !== "none") {
    windowFields.notified_at = new Date(now).toISOString();
    windowFields.claim_expires_at = new Date(
      claimWindow === "open" ? now + 60 * 60 * 1000 : now - 60 * 60 * 1000
    ).toISOString();
  }

  const row = {
    event_id: eventId,
    full_name: `Așteptare E2E ${unique("w")}`,
    email: `wait-${unique("m")}@example.com`,
    phone: "+40721112233",
    ...windowFields,
  };
  const { data, error } = await (await serviceClient())
    .from("waiting_list")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(`seedWaitingEntry failed: ${error.message}`);
  return (data as { id: string }).id;
}
