import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { formatPrice } from "@/lib/money";
import { formatEventSchedule } from "@/lib/utils";
import {
  eventPageUrl,
  eventTitle,
  fillHtml,
  fillText,
  sampleVars,
  type EmailEvent,
  type EmailLocale,
  type TemplateType,
} from "@/lib/email-content";
import { renderEmail, type EmailCardEvent } from "@/lib/email-layout";
import { emailImage, type EmailSettings } from "@/lib/email-brand";

/**
 * An email as it will look, before it is sent: the admin's live preview and
 * the "Trimite-mi un test" email are both drawn here, with the real layout
 * and the data of a real event. Takes a Supabase client, so the browser reads
 * with her session and the server with its key.
 */

type Client = SupabaseClient<Database>;

const SAMPLE_EVENT_COLUMNS =
  "slug, title_ro, title_en, date, time, end_date, end_time, location, whatsapp_group_link, starts_at";

/**
 * The event a preview is filled from: the next one to start, or, with none
 * coming up, the most recent. Null when there are no events at all.
 */
export async function loadSampleEvent(supabase: Client): Promise<(EmailEvent & { slug: string }) | null> {
  const { data: next, error } = await supabase
    .from("events")
    .select(SAMPLE_EVENT_COLUMNS)
    .eq("published", true)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (next) return next;
  const { data: last, error: lastError } = await supabase
    .from("events")
    .select(SAMPLE_EVENT_COLUMNS)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;
  return last ?? null;
}

const CARD_COLUMNS =
  "id, slug, title_ro, title_en, date, time, end_date, end_time, location, price, currency, image_url, published";

export type CardEventRow = {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  date: string;
  time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  price: number;
  currency: string | null;
  image_url: string | null;
  published: boolean;
};

/** The events an announcement's text shows as cards, by the ids in it. */
export function eventCardIds(...bodies: (string | null | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const body of bodies) {
    for (const match of (body ?? "").matchAll(/data-event-card="([0-9a-f-]{36})"/gi)) ids.add(match[1]);
  }
  return [...ids];
}

export async function loadCardEvents(supabase: Client, ids: string[]): Promise<CardEventRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("events").select(CARD_COLUMNS).in("id", ids);
  if (error) throw error;
  return data ?? [];
}

const FREE = { ro: "Gratuit", en: "Free" } as const;

/**
 * The cards, in one language. Only published events: an unpublished one has
 * no page for the card's button to open, so its card is left out.
 */
export function cardEventsFor(rows: CardEventRow[], locale: EmailLocale, siteUrl: string): Record<string, EmailCardEvent> {
  const cards: Record<string, EmailCardEvent> = {};
  for (const event of rows) {
    if (!event.published) continue;
    const schedule = formatEventSchedule(event, locale);
    cards[event.id] = {
      title: eventTitle(event, locale),
      date: schedule.date,
      time: schedule.time,
      location: event.location,
      price: event.price > 0 ? formatPrice(event.price, event.currency, locale) : FREE[locale],
      imageUrl: emailImage(event.image_url, siteUrl),
      url: eventPageUrl(siteUrl, event.slug, locale),
    };
  }
  return cards;
}

/** The name a sample announcement is addressed to. */
export const SAMPLE_RECIPIENT = "Ana Popescu";

export type PreviewInput =
  | {
      kind: "template";
      type: TemplateType;
      locale: EmailLocale;
      subject: string;
      body: string;
      settings: EmailSettings;
      event: EmailEvent | null;
    }
  | {
      kind: "announcement";
      locale: EmailLocale;
      subject: string;
      body: string;
      settings: EmailSettings;
      cards: Record<string, EmailCardEvent>;
      /** Whom it is shown addressed to: the first person it will go to, when there is one. */
      name?: string;
    };

/** The email a preview shows, drawn exactly as a sent one would be. */
export function previewEmail(input: PreviewInput): { subject: string; html: string; text: string } {
  const { settings, locale } = input;
  const siteUrl = settings.brand.siteUrl;
  const vars =
    input.kind === "template"
      ? sampleVars(input.type, locale, input.event, siteUrl)
      : { user_name: input.name?.trim() || SAMPLE_RECIPIENT };
  const subject = fillText(input.subject, vars);
  const { html, text } = renderEmail({
    brand: settings.brand,
    locale,
    subject,
    body: fillHtml(input.body, vars),
    events: input.kind === "announcement" ? input.cards : undefined,
    // A preview shows the footer an announcement has, with a link that
    // unsubscribes nobody.
    unsubscribeUrl: input.kind === "announcement" ? `${siteUrl}/${locale}/unsubscribe` : undefined,
  });
  return { subject, html, text };
}
