import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let scoped: SupabaseClient | null = null;

async function adminScoped(): Promise<SupabaseClient> {
  if (scoped) return scoped;
  const { email, password } = adminCreds();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase URL / publishable key missing in .env");

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`helper auth failed: ${error.message}`);
  await client.auth.setSession(data.session);
  scoped = client;
  return client;
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
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { data, error } = await createAdminClient().from("registrations").insert(row).select("id").single();
  if (error) {
    await deleteEventBySlug(event.slug);
    throw new Error(`seedRegistration failed: ${error.message}`);
  }
  return { id: (data as { id: string }).id, eventSlug: event.slug, fullName, email };
}

export async function seedWaitingEntry(eventId: string) {
  const row = {
    event_id: eventId,
    full_name: `Așteptare E2E ${unique("w")}`,
    email: `wait-${unique("m")}@example.com`,
    phone: "+40721112233",
  };
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { data, error } = await createAdminClient().from("waiting_list").insert(row).select("id").single();
  if (error) throw new Error(`seedWaitingEntry failed: ${error.message}`);
  return (data as { id: string }).id;
}
