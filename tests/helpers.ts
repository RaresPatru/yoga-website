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

/**
 * Where the local stack catches outgoing mail. Nothing is delivered anywhere
 * real; Supabase points its SMTP at this in development, and the port comes
 * from `[inbucket]` in supabase/config.toml.
 */
const MAILBOX_URL = "http://127.0.0.1:54324";

/**
 * Creates a throwaway account for the password-reset test.
 *
 * Deliberately *not* the shared Playwright admin. That account's password lives
 * in TEST_ADMIN_PASSWORD and the entire admin suite signs in with it, so a test
 * that changes it would break every other spec the moment it ran in parallel —
 * or leave the suite unrunnable if it failed halfway and never restored it.
 * A user created and destroyed inside one test cannot do that to anything.
 *
 * No `admins` row: the reset flow deliberately does not require one. Resetting
 * a password proves control of a mailbox, which is a different question from
 * whether the account may enter /admin — that is still `is_admin()`, checked by
 * proxy.ts on every other route.
 */
export async function createThrowawayUser(password: string) {
  const email = `${unique("reset-e2e")}@test.local`;
  const { data, error } = await (await serviceClient()).auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createThrowawayUser failed: ${error.message}`);
  return { id: data.user.id, email };
}

/**
 * Puts a throwaway account on the admin list, so it can actually reach /admin.
 *
 * Signing in is not the same as being authorised here — `is_admin()` is, and
 * proxy.ts checks it on every request. A test about admin sessions needs an
 * account that passes both.
 */
export async function grantAdmin(userId: string, email: string) {
  const { error } = await (await serviceClient())
    .from("admins")
    .insert({ user_id: userId, email });
  if (error) throw new Error(`grantAdmin failed: ${error.message}`);
}

export async function deleteThrowawayUser(id: string) {
  const { error } = await (await serviceClient()).auth.admin.deleteUser(id);
  if (error) throw new Error(`deleteThrowawayUser failed: ${error.message}`);
}

/** Signs in over the API, to assert a password works without driving the UI. */
export async function passwordWorks(
  email: string,
  password: string
): Promise<boolean> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}

/**
 * Pulls the most recent recovery link out of the local mailbox.
 *
 * Polls rather than sleeping: the email is sent asynchronously after the API
 * call returns, so a fixed wait is either flaky or slow. The link is read from
 * the message body exactly as a person would receive it, which is the point —
 * asserting on a token generated inside the test would prove nothing about
 * whether the email itself is usable.
 */
export async function recoveryLinkFor(
  email: string,
  timeoutMs = 15_000
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const list = await fetch(`${MAILBOX_URL}/api/v1/messages`).then((r) =>
      r.json()
    );

    for (const summary of list.messages ?? []) {
      const to = (summary.To ?? []).map(
        (t: { Address: string }) => t.Address?.toLowerCase()
      );
      if (!to.includes(email.toLowerCase())) continue;

      const message = await fetch(
        `${MAILBOX_URL}/api/v1/message/${summary.ID}`
      ).then((r) => r.json());

      const body: string = message.HTML || message.Text || "";
      const match = body.match(
        /https?:\/\/[^"'<>\s]*\/auth\/v1\/verify[^"'<>\s]*/
      );
      // Mail bodies are HTML, so `&` arrives as `&amp;` and the URL is unusable
      // until that is undone. Following it verbatim drops every parameter after
      // the first and produces a confusing "token is invalid".
      if (match) return match[0].replace(/&amp;/g, "&");
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`no recovery email arrived for ${email} within ${timeoutMs}ms`);
}

/**
 * Reads and writes one row of the instructor's editable copy.
 *
 * `site_content` is seeded rather than created, so a test that changes a value
 * has to put the old one back — there is no row to delete. Both halves go
 * through the signed-in admin client, which is the same path the content screen
 * uses, so a broken RLS policy fails here rather than silently writing nothing.
 */
export async function siteContentValue(key: string): Promise<string> {
  const { data, error } = await (await adminScoped())
    .from("site_content")
    .select("value_ro")
    .eq("key", key)
    .single();
  if (error) throw new Error(`siteContentValue(${key}) failed: ${error.message}`);
  return (data as { value_ro: string }).value_ro;
}

export async function setSiteContent(key: string, valueRo: string) {
  const { error } = await (await adminScoped())
    .from("site_content")
    .update({ value_ro: valueRo })
    .eq("key", key);
  if (error) throw new Error(`setSiteContent(${key}) failed: ${error.message}`);
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
    .select("id, slug, price, currency, max_participants, time, end_date, end_time, starts_at, ends_at")
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

/**
 * Change an event's capacity, the way she would in the admin panel.
 *
 * Capacity is the one field whose value decides whether anybody may book at
 * all — NULL and 0 mean sold out — so moving it is how a test gets an event
 * from closed to open without driving the form.
 */
export async function updateEventCapacity(eventId: string, capacity: number | null) {
  const { error } = await (await adminScoped())
    .from("events")
    .update({ max_participants: capacity })
    .eq("id", eventId);
  if (error) throw new Error(`updateEventCapacity failed: ${error.message}`);
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

/** Updates a post as the admin would, and returns its timestamps afterwards. */
export async function updatePost(
  slug: string,
  patch: Record<string, unknown>
): Promise<{ created_at: string; updated_at: string }> {
  const { data, error } = await (await adminScoped())
    .from("blog_posts")
    .update(patch)
    .eq("slug", slug)
    .select("created_at, updated_at")
    .single();
  if (error) throw new Error(`updatePost failed: ${error.message}`);
  return data as { created_at: string; updated_at: string };
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

/** The dashboard's five counts, read as the admin: the view applies her row policies. */
export interface DashboardCounts {
  active_events: number;
  pending_payments: number;
  draft_posts: number;
  unread_messages: number;
  pending_testimonials: number;
}

export async function dashboardCounts(): Promise<DashboardCounts> {
  const { data, error } = await (await adminScoped()).from("admin_dashboard").select("*").single();
  if (error) throw new Error(`dashboardCounts failed: ${error.message}`);
  return data as DashboardCounts;
}

/** What is waiting on one event: the admin_event_overview row the dashboard reads. */
export async function eventOverview(
  eventId: string
): Promise<{ waiting: number; pending_payments: number }> {
  const { data, error } = await (await adminScoped())
    .from("admin_event_overview")
    .select("waiting, pending_payments")
    .eq("event_id", eventId)
    .single();
  if (error) throw new Error(`eventOverview failed: ${error.message}`);
  return data as { waiting: number; pending_payments: number };
}

/**
 * A message as the contact form leaves it. Written with the service key, as
 * app/api/contact/route.ts writes it.
 */
export async function seedMessage(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await (await serviceClient())
    .from("contact_messages")
    .insert({
      name: `Vizitator E2E ${unique("n")}`,
      email: `msg-${unique("m")}@example.com`,
      subject: "Mesaj E2E",
      message: "Un mesaj de test, trimis de suita E2E.",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedMessage failed: ${error.message}`);
  return (data as { id: string }).id;
}

export async function deleteMessages(ids: string[]) {
  const { error } = await (await serviceClient()).from("contact_messages").delete().in("id", ids);
  if (error) throw new Error(`deleteMessages failed: ${error.message}`);
}

/** A date `days` from today in Bucharest, as YYYY-MM-DD (negative for the past). */
export function bucharestDate(days: number): string {
  // en-CA formats as YYYY-MM-DD. Noon keeps the arithmetic clear of the hour
  // the clocks change.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A site_content row as it stands, or null when it has never been saved. */
export type ContentSnapshot = { value_ro: string; value_en: string | null } | null;

export async function contentSnapshot(key: string): Promise<ContentSnapshot> {
  const { data, error } = await (await adminScoped())
    .from("site_content")
    .select("value_ro, value_en")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`contentSnapshot(${key}) failed: ${error.message}`);
  return data as ContentSnapshot;
}

/** Writes a field, creating its row if needed, as the admin's Save does. */
export async function putContent(key: string, valueRo: string, valueEn: string | null = null) {
  const section = key.split(".")[0];
  const { error } = await (await adminScoped())
    .from("site_content")
    .upsert({ key, section, value_ro: valueRo, value_en: valueEn }, { onConflict: "key" });
  if (error) throw new Error(`putContent(${key}) failed: ${error.message}`);
}

/** Puts a field back as contentSnapshot found it, removing a row the test created. */
export async function restoreContent(key: string, snapshot: ContentSnapshot) {
  if (snapshot) return putContent(key, snapshot.value_ro, snapshot.value_en);
  const { error } = await (await adminScoped()).from("site_content").delete().eq("key", key);
  if (error) throw new Error(`restoreContent(${key}) failed: ${error.message}`);
}

/** Removes the FAQs a test created, found by their Romanian question. */
export async function deleteFaqsByQuestion(questionRo: string) {
  const { error } = await (await adminScoped()).from("faqs").delete().eq("question_ro", questionRo);
  if (error) throw new Error(`deleteFaqsByQuestion failed: ${error.message}`);
}

/** Inserts a FAQ the way a bare insert would, to check the table's defaults. */
export async function insertBareFaq(questionRo: string): Promise<{ published: boolean }> {
  const { data, error } = await (await adminScoped())
    .from("faqs")
    .insert({ question_ro: questionRo, answer_ro: "" })
    .select("published")
    .single();
  if (error) throw new Error(`insertBareFaq failed: ${error.message}`);
  return data as { published: boolean };
}

/** A post as the admin sees it, by id, or null. */
export async function postById(id: string) {
  const { data, error } = await (await adminScoped()).from("blog_posts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`postById failed: ${error.message}`);
  return data as Record<string, unknown> | null;
}

/** A post's unpublished changes (content_drafts.data), or null. */
export async function draftFor(postId: string) {
  const { data, error } = await (await adminScoped())
    .from("content_drafts")
    .select("data")
    .eq("post_id", postId)
    .maybeSingle();
  if (error) throw new Error(`draftFor failed: ${error.message}`);
  return (data?.data as Record<string, unknown> | undefined) ?? null;
}

/** Posts whose Romanian title starts with a test's marker: for cleaning up posts the editor created. */
export async function deletePostsTitled(prefix: string) {
  const { error } = await (await adminScoped()).from("blog_posts").delete().like("title_ro", `${prefix}%`);
  if (error) throw new Error(`deletePostsTitled failed: ${error.message}`);
}

export async function deletePostById(id: string) {
  const { error } = await (await adminScoped()).from("blog_posts").delete().eq("id", id);
  if (error) throw new Error(`deletePostById failed: ${error.message}`);
}

/** How many posts exist in total, drafts included. */
export async function postCount(): Promise<number> {
  const { count, error } = await (await adminScoped())
    .from("blog_posts")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`postCount failed: ${error.message}`);
  return count ?? 0;
}
