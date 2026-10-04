import { test, expect } from "@playwright/test";
import { fillHtml, fillText } from "../lib/email-content";
import { htmlToText, renderEmail, type EmailBrand } from "../lib/email-layout";

/**
 * Filling a template in and drawing it in the site's layout
 * (lib/email-content.ts, lib/email-layout.ts): the same functions the
 * admin's preview runs in the browser and the server runs before sending.
 */

const brand: EmailBrand = {
  siteName: "flow4ward",
  logoUrl: null,
  display: "name",
  businessName: "Ana Popescu PFA",
  address: "Str. Lungă 1\nCluj-Napoca",
  siteUrl: "https://flow4ward.test",
};

test.describe("filling a template in", () => {
  test("escapes every value, so a name typed into a form cannot become a link", () => {
    const html = fillHtml("<p>Salut {{user_name}}!</p>", {
      user_name: '<a href="http://evil.example">Apasă aici</a>',
    });
    expect(html).toBe("<p>Salut &lt;a href=&quot;http://evil.example&quot;&gt;Apasă aici&lt;/a&gt;!</p>");
  });

  test("writes a subject as plain text: an ampersand stays an ampersand", () => {
    expect(fillText("Confirmare - {{event_name}}", { event_name: "Yoga & brunch" })).toBe("Confirmare - Yoga & brunch");
    expect(fillText("Rând\nnou {{x}}", { x: "a" }), "a header holds no line break").toBe("Rând nou a");
  });

  test("leaves out a labelled line whose value is empty", () => {
    const html = fillHtml(
      "<p><strong>Data:</strong> {{event_date}}<br><strong>Ora:</strong> {{event_time}}<br><strong>Locație:</strong> {{event_location}}</p>",
      { event_date: "10 octombrie 2026", event_time: "", event_location: "Cluj" }
    );
    expect(html).toBe("<p><strong>Data:</strong> 10 octombrie 2026<br><strong>Locație:</strong> Cluj</p>");
  });

  test("leaves out a button with nowhere to go, and unlinks words beside an empty link", () => {
    const html = fillHtml(
      '<p><a href="{{whatsapp_link}}">Intră în grupul de WhatsApp</a></p><p>Scrie-ne <a href="{{whatsapp_link}}">aici</a> oricând.</p><p>Gata.</p>',
      { whatsapp_link: "" }
    );
    expect(html).toBe("<p>Scrie-ne aici oricând.</p><p>Gata.</p>");
  });

  test("keeps a link whose address is there", () => {
    expect(fillHtml('<p><a href="{{claim_url}}">Rezervă</a></p>', { claim_url: "https://x.test/a?b=1&c=2" })).toBe(
      '<p><a href="https://x.test/a?b=1&amp;c=2">Rezervă</a></p>'
    );
  });
});

test.describe("the layout", () => {
  test("draws a link alone on its line as a button, and styles the rest", () => {
    const { html } = renderEmail({
      brand,
      locale: "ro",
      subject: "S",
      body: '<h2>Salut!</h2><p>Text <a href="https://x.test/p">link</a>.</p><p><a href="https://x.test/b">Rezervă-ți locul</a></p>',
    });
    expect(html).toMatch(/<td style="border-radius:999px;background-color:#A94E67;"><a href="https:\/\/x\.test\/b"[^>]*>Rezervă-ți locul<\/a><\/td>/);
    expect(html).toMatch(/<h2 style="[^"]+">Salut!<\/h2>/);
    expect(html).toMatch(/<a href="https:\/\/x\.test\/p" style="[^"]+">link<\/a>/);
    // Her name at the top, her business and address at the bottom.
    expect(html).toContain(">flow4ward</a>");
    expect(html).toContain("Ana Popescu PFA<br>Str. Lungă 1<br>Cluj-Napoca");
    expect(html).not.toContain("Dezabonează-te");
  });

  test("gives an announcement the reason it was sent and a way out", () => {
    const { html, text } = renderEmail({
      brand,
      locale: "en",
      subject: "News",
      body: "<p>Hello.</p>",
      unsubscribeUrl: "https://flow4ward.test/en/unsubscribe?token=abc",
    });
    expect(html).toContain("You are receiving this because you chose to hear about new events from flow4ward.");
    expect(html).toContain('href="https://flow4ward.test/en/unsubscribe?token=abc"');
    expect(text).toContain("Unsubscribe: https://flow4ward.test/en/unsubscribe?token=abc");
  });

  test("draws an event card, and leaves out one it knows nothing about", () => {
    const { html, text } = renderEmail({
      brand,
      locale: "ro",
      subject: "S",
      body: '<p>Vino!</p><div data-event-card="11111111-1111-1111-1111-111111111111"></div><div data-event-card="22222222-2222-2222-2222-222222222222"></div>',
      events: {
        "11111111-1111-1111-1111-111111111111": {
          title: "Retreat de toamnă",
          date: "10 octombrie 2026",
          time: "10:00",
          location: "Sibiu",
          price: "350 RON",
          imageUrl: "https://flow4ward.test/a.webp",
          url: "https://flow4ward.test/ro/events/retreat",
        },
      },
    });
    expect(html).toContain("Retreat de toamnă");
    expect(html).toContain("10 octombrie 2026, 10:00<br>Sibiu<br>350 RON");
    expect(html).toContain('href="https://flow4ward.test/ro/events/retreat"');
    expect(html).not.toContain("22222222");
    expect(html).not.toContain("data-event-card");
    expect(text).toContain("Vezi detalii și rezervă: https://flow4ward.test/ro/events/retreat");
  });

  test("makes a path on the site a full address, and drops anything that is not a link", () => {
    const { html } = renderEmail({
      brand,
      locale: "ro",
      subject: "S",
      body: '<p><a href="/ro/events">evenimente</a> și <a href="javascript:alert(1)">nu</a></p>',
    });
    expect(html).toContain('href="https://flow4ward.test/ro/events"');
    expect(html).not.toContain("javascript:");
  });
});

test.describe("the plain-text version", () => {
  test("keeps paragraphs, lists and where each link leads", () => {
    expect(
      htmlToText(
        '<h2>Salut!</h2><p>Vezi <a href="https://x.test/p">pagina</a>.</p><p><a href="https://x.test/b">Rezervă</a></p><ul><li><p>unu</p></li><li><p>doi</p></li></ul><ol><li><p>primul</p></li><li><p>al doilea</p></li></ol><p>Ana &amp; Ion</p>'
      )
    ).toBe("Salut!\n\nVezi pagina (https://x.test/p).\n\nRezervă: https://x.test/b\n\n- unu\n- doi\n\n1. primul\n2. al doilea\n\nAna & Ion");
  });

  test("starts with her name and ends with her details", () => {
    const { text } = renderEmail({ brand, locale: "ro", subject: "S", body: "<p>Mesaj.</p>" });
    expect(text).toBe("flow4ward\n\nMesaj.\n\n--\nAna Popescu PFA\nStr. Lungă 1\nCluj-Napoca\n\nhttps://flow4ward.test\n");
  });
});
