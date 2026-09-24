-- ===========================================================================
-- New questions start hidden, and the legal pages start as drafts
-- ===========================================================================
--
-- 1. A new FAQ starts hidden (audit B14).
--
--    `faqs.published` defaulted to true, so pressing "Add" put an empty
--    "Întrebare nouă" on the live home page before she had written a word.
--    It now defaults to false, and she publishes each question with a switch.
--    Existing questions keep whatever they are set to.
--
-- 2. Drafts of the three legal documents, in both languages.
--
--    The privacy policy, the terms and the cookie policy are ordinary
--    site_content rows (legal.privacy, legal.terms, legal.cookies), edited in
--    "Conținut site" → "Pagini legale" and shown at /privacy, /terms and
--    /cookies. Facts only she can supply appear as {{tokens}}
--    ({{business_name}}, {{registration}}, {{address}}, {{email}}, {{vat}}),
--    which the pages fill in from her business details and otherwise draw as a
--    visible dashed marker. docs/PRIVACY.md lists what she has to fill in and
--    what a lawyer should check. None of this is legal advice.
--
--    `on conflict do nothing`: a document she has already started editing is
--    never overwritten by a later run.
--
-- Access is unchanged. Both tables keep the grants and policies of the
-- baseline: anyone may read published FAQs and all site content; only the
-- admin may write.

alter table public.faqs alter column published set default false;

comment on column public.faqs.published is
  'Whether the question shows on the home page. New questions start hidden until she publishes them.';

insert into public.site_content (key, section, sort_order, field_type, label_ro, value_ro, value_en)
values
(
  'legal.privacy', 'legal', 60, 'richtext', 'Politica de confidențialitate',
  $ro$<p>Această pagină explică ce date personale colectează {{site_name}}, de ce, cât timp le păstrăm și ce drepturi ai.</p>
<h2>Cine răspunde de datele tale</h2>
<p>Operatorul datelor este {{business_name}}, CUI {{registration}}, cu sediul în {{address}}. Pentru orice întrebare despre datele tale, scrie la {{email}}.</p>
<h2>Ce date colectăm și de ce</h2>
<ul>
<li><p><strong>Când te înscrii la un eveniment</strong>: numele, adresa de email și numărul de telefon. Le folosim ca să îți rezervăm locul, să îți trimitem confirmarea și detaliile evenimentului și să te contactăm dacă se schimbă ceva. Temeiul este contractul pe care îl încheiem când te înscrii.</p></li>
<li><p><strong>Când intri pe lista de așteptare</strong>: aceleași date, ca să te anunțăm dacă se eliberează un loc.</p></li>
<li><p><strong>Când plătești</strong>: plata se face prin Stripe. Datele cardului le introduci direct la Stripe; noi nu le vedem și nu le păstrăm. Primim doar confirmarea că plata s-a făcut.</p></li>
<li><p><strong>Când ne scrii prin formularul de contact</strong>: numele, adresa de email și mesajul, ca să îți putem răspunde. Temeiul este interesul nostru legitim de a răspunde la mesaje.</p></li>
<li><p><strong>Când folosești site-ul</strong>: statistici despre paginile vizitate, fără cookie-uri și fără a te identifica, ca să vedem ce conținut e util. Formularele sunt protejate împotriva spamului de Cloudflare Turnstile.</p></li>
</ul>
<h2>Cine mai vede datele</h2>
<p>Folosim câțiva furnizori care prelucrează date în numele nostru, fiecare doar pentru rolul lui: Supabase (baza de date), Vercel (găzduirea site-ului), Stripe (plățile), Resend (trimiterea emailurilor), Cloudflare (protecția împotriva spamului) și PostHog (statisticile de vizitare). Unii dintre ei pot prelucra date în afara Spațiului Economic European; în acest caz, transferul se face pe baza unei decizii de adecvare a Comisiei Europene sau a clauzelor contractuale standard. Nu vindem datele tale și nu le folosim pentru reclame.</p>
<h2>Cât timp păstrăm datele</h2>
<ul>
<li><p>Datele înscrierilor: 3 ani de la data evenimentului.</p></li>
<li><p>Documentele de plată: cât cere legislația contabilă.</p></li>
<li><p>Lista de așteptare: până la încheierea evenimentului.</p></li>
<li><p>Mesajele din formularul de contact: până se încheie discuția, cel mult un an.</p></li>
</ul>
<h2>Drepturile tale</h2>
<p>Ai dreptul să afli ce date avem despre tine, să le corectezi, să ceri ștergerea lor, să restricționezi sau să te opui prelucrării și să le primești într-un format pe care îl poți duce în altă parte. Pentru oricare dintre acestea, scrie la {{email}}. Îți răspundem în cel mult o lună.</p>
<p>Dacă ai o nemulțumire, te poți adresa Autorității Naționale de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP), la www.dataprotection.ro.</p>$ro$,
  $en$<p>This page explains what personal data {{site_name}} collects, why, how long we keep it and what your rights are.</p>
<h2>Who is responsible for your data</h2>
<p>The data controller is {{business_name}}, registration number {{registration}}, registered at {{address}}. For any question about your data, write to {{email}}.</p>
<h2>What we collect and why</h2>
<ul>
<li><p><strong>When you book an event</strong>: your name, email address and phone number. We use them to hold your place, send your confirmation and the event details, and contact you if anything changes. The legal basis is the contract we make when you book.</p></li>
<li><p><strong>When you join a waiting list</strong>: the same details, so we can tell you if a place frees up.</p></li>
<li><p><strong>When you pay</strong>: payment goes through Stripe. You enter your card details with Stripe directly; we never see or keep them. We only receive confirmation that the payment went through.</p></li>
<li><p><strong>When you write to us through the contact form</strong>: your name, email address and message, so we can reply. The legal basis is our legitimate interest in answering messages.</p></li>
<li><p><strong>When you use the site</strong>: statistics about the pages visited, without cookies and without identifying you, so we can see which content is useful. The forms are protected from spam by Cloudflare Turnstile.</p></li>
</ul>
<h2>Who else sees the data</h2>
<p>We use a few providers who process data on our behalf, each only for its own job: Supabase (the database), Vercel (hosting), Stripe (payments), Resend (sending email), Cloudflare (spam protection) and PostHog (visitor statistics). Some of them may process data outside the European Economic Area; when they do, the transfer relies on an adequacy decision of the European Commission or on standard contractual clauses. We do not sell your data or use it for advertising.</p>
<h2>How long we keep it</h2>
<ul>
<li><p>Booking details: 3 years from the date of the event.</p></li>
<li><p>Payment records: as long as accounting law requires.</p></li>
<li><p>Waiting lists: until the event has ended.</p></li>
<li><p>Contact form messages: until the conversation ends, and at most one year.</p></li>
</ul>
<h2>Your rights</h2>
<p>You have the right to know what data we hold about you, to correct it, to ask for it to be deleted, to restrict or object to its processing, and to receive it in a format you can take elsewhere. For any of these, write to {{email}}. We reply within one month.</p>
<p>If you have a complaint, you can contact the Romanian data protection authority (ANSPDCP) at www.dataprotection.ro.</p>$en$
),
(
  'legal.terms', 'legal', 70, 'richtext', 'Termeni și condiții',
  $ro$<p>Acești termeni se aplică înscrierilor la evenimentele organizate de {{business_name}}, CUI {{registration}}, cu sediul în {{address}}, prin site-ul {{site_name}} ({{site_url}}). Prin înscriere, confirmi că i-ai citit.</p>
<h2>Înscrierea</h2>
<p>Te înscrii completând formularul de pe pagina evenimentului. Pentru un eveniment gratuit, locul este rezervat imediat. Pentru un eveniment cu plată, locul este rezervat după ce plata este confirmată. Primești un email de confirmare în ambele cazuri.</p>
<h2>Prețuri și plată</h2>
<p>Prețul fiecărui eveniment este afișat pe pagina lui, în moneda indicată acolo. {{vat}}. Plata se face cu cardul, prin Stripe.</p>
<h2>Lista de așteptare</h2>
<p>Când un eveniment este complet, te poți înscrie pe lista de așteptare. Dacă se eliberează un loc, primești un email cu un link valabil 24 de ore. Locul se ocupă în ordinea în care oamenii folosesc linkul.</p>
<h2>Anulare și rambursare</h2>
<ul>
<li><p>Dacă anulezi cu cel puțin 7 zile înainte de eveniment, primești banii înapoi integral.</p></li>
<li><p>Dacă anulezi mai târziu, banii nu se mai rambursează, dar poți ceda locul altei persoane, anunțând-o pe organizatoare.</p></li>
<li><p>Dacă evenimentul este anulat de organizatoare, primești banii înapoi integral.</p></li>
</ul>
<p>Pentru o anulare, scrie la {{email}}. Dreptul de retragere în 14 zile nu se aplică serviciilor de agrement programate pentru o dată anume (OUG 34/2014, art. 16 lit. l).</p>
<h2>Sănătate</h2>
<p>Practicile de yoga și activitățile din cadrul evenimentelor presupun efort fizic. Dacă ai o afecțiune, o accidentare sau ești însărcinată, întreabă-ți medicul înainte și anunț-o pe organizatoare. Participi pe propria răspundere și îți asculți corpul: poți face pauză oricând.</p>
<h2>Fotografii</h2>
<p>La unele evenimente se fac fotografii. Dacă nu vrei să apari în ele, spune-i organizatoarei la începutul evenimentului.</p>
<h2>Reclamații</h2>
<p>Pentru orice nemulțumire, scrie mai întâi la {{email}}. Poți apela și la Autoritatea Națională pentru Protecția Consumatorilor (ANPC), prin reclamatiisal.anpc.ro.</p>$ro$,
  $en$<p>These terms apply to bookings for events organised by {{business_name}}, registration number {{registration}}, registered at {{address}}, through the {{site_name}} website ({{site_url}}). By booking, you confirm you have read them.</p>
<h2>Booking</h2>
<p>You book by filling in the form on the event’s page. For a free event, your place is held straight away. For a paid event, your place is held once the payment is confirmed. Either way, you receive a confirmation email.</p>
<h2>Prices and payment</h2>
<p>Each event’s price is shown on its page, in the currency given there. {{vat}}. Payment is by card, through Stripe.</p>
<h2>Waiting list</h2>
<p>When an event is full, you can join its waiting list. If a place frees up, you receive an email with a link that works for 24 hours. Places go in the order people use their link.</p>
<h2>Cancellations and refunds</h2>
<ul>
<li><p>If you cancel at least 7 days before the event, you get a full refund.</p></li>
<li><p>If you cancel later, the price is not refunded, but you can give your place to someone else by letting the organiser know.</p></li>
<li><p>If the organiser cancels the event, you get a full refund.</p></li>
</ul>
<p>To cancel, write to {{email}}. The 14-day right of withdrawal does not apply to leisure services booked for a specific date (Directive 2011/83/EU, art. 16(l)).</p>
<h2>Health</h2>
<p>Yoga and the activities at these events involve physical effort. If you have a medical condition or an injury, or are pregnant, ask your doctor first and tell the organiser. You take part at your own responsibility and should listen to your body: you can pause at any time.</p>
<h2>Photos</h2>
<p>Photos are taken at some events. If you would rather not appear in them, tell the organiser at the start of the event.</p>
<h2>Complaints</h2>
<p>For any complaint, please write to {{email}} first. You can also contact the Romanian consumer protection authority (ANPC) at reclamatiisal.anpc.ro.</p>$en$
),
(
  'legal.cookies', 'legal', 80, 'richtext', 'Politica de cookie-uri',
  $ro$<p>Un cookie este un mic fișier pe care un site îl salvează în browserul tău. {{site_name}} folosește doar ce e necesar ca site-ul să funcționeze, așa că nu îți cerem acordul printr-un banner.</p>
<h2>Cookie-urile folosite</h2>
<ul>
<li><p><strong>NEXT_LOCALE</strong>: ține minte limba aleasă (română sau engleză). Este necesar și se șterge când închizi browserul.</p></li>
</ul>
<h2>Statistici fără cookie-uri</h2>
<p>Numărăm vizitele cu PostHog, fără cookie-uri și fără să salvăm ceva în browserul tău, deci fără să te putem recunoaște de la o vizită la alta.</p>
<h2>Conținut de pe alte site-uri</h2>
<p>Unele pagini includ videoclipuri de pe YouTube, Vimeo sau Instagram. Aceste servicii pot seta propriile cookie-uri, după regulile lor. La plată, ești dus pe pagina Stripe, care are propria politică de cookie-uri.</p>
<h2>Cum le controlezi</h2>
<p>Poți șterge sau bloca cookie-urile din setările browserului. Site-ul funcționează și fără ele; doar limba aleasă nu va mai fi ținută minte.</p>
<p>Întrebări: {{email}}.</p>$ro$,
  $en$<p>A cookie is a small file a website saves in your browser. {{site_name}} only uses what the site needs to work, so we do not ask for your consent with a banner.</p>
<h2>Cookies we use</h2>
<ul>
<li><p><strong>NEXT_LOCALE</strong>: remembers the language you chose (Romanian or English). It is necessary, and it is deleted when you close your browser.</p></li>
</ul>
<h2>Statistics without cookies</h2>
<p>We count visits with PostHog without cookies and without saving anything in your browser, so we cannot recognise you from one visit to the next.</p>
<h2>Content from other sites</h2>
<p>Some pages include videos from YouTube, Vimeo or Instagram. These services may set their own cookies, under their own rules. When you pay, you are taken to Stripe’s page, which has its own cookie policy.</p>
<h2>How to control them</h2>
<p>You can delete or block cookies in your browser’s settings. The site still works without them; it just won’t remember the language you chose.</p>
<p>Questions: {{email}}.</p>$en$
)
on conflict (key) do nothing;
