-- ===========================================================================
-- The privacy policy says what the visitor statistics collect
-- ===========================================================================
--
-- Phase 11 of docs/OVERHAUL.md. The statistics used to be described as
-- "pages visited". They now also count the steps of a booking and the posts
-- read to the end, they run on PostHog's servers in the EU, and a browser that
-- sends Global Privacy Control or Do Not Track is not counted
-- (lib/analytics.ts). A privacy policy has to say what is collected, on what
-- legal basis and for how long (GDPR art. 13), so the draft says so.
--
-- The legal pages are drafts kept in site_content, which she edits in
-- "Conținut site → Pagini legale". Each sentence below is replaced only where
-- it still reads exactly as drafted, and not yet as revised (the retention
-- lines keep the drafted line and add one after it). Otherwise the row is
-- not touched at all: an update would move the page's "last updated" date
-- (set_updated_at) for a change that never happened.
--
-- Data only: no table, function or grant changes.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. What the statistics collect, and why
-- ---------------------------------------------------------------------------
update public.site_content
   set value_ro = replace(value_ro, change.drafted, change.revised)
  from (values (
         '<li><p><strong>Când folosești site-ul</strong>: statistici despre paginile vizitate, fără cookie-uri și fără a te identifica, ca să vedem ce conținut e util. Formularele sunt protejate împotriva spamului de Cloudflare Turnstile.</p></li>',
         '<li><p><strong>Când folosești site-ul</strong>: statistici despre vizite, adunate cu PostHog, pe serverele lui din Uniunea Europeană: ce pagini se deschid, de unde vine vizita (de exemplu, de pe Instagram), tipul de dispozitiv și de browser, țara și orașul, aflate din adresa IP, câte persoane apasă butonul de înscriere și câte ajung să aibă un loc, și ce articole sunt citite până la capăt. Nu trimitem numele, adresa de email sau ce scrii în formulare, nu folosim cookie-uri și nu salvăm nimic în browserul tău, așa că nu te putem recunoaște de la o vizită la alta. Dacă browserul tău trimite semnalul Global Privacy Control sau Do Not Track, vizita nu este numărată. Temeiul este interesul nostru legitim de a afla ce conținut e util. Formularele sunt protejate împotriva spamului de Cloudflare Turnstile.</p></li>'
       )) as change (drafted, revised)
 where key = 'legal.privacy'
   and strpos(value_ro, change.drafted) > 0
   and strpos(value_ro, change.revised) = 0;

update public.site_content
   set value_en = replace(value_en, change.drafted, change.revised)
  from (values (
         '<li><p><strong>When you use the site</strong>: statistics about the pages visited, without cookies and without identifying you, so we can see which content is useful. The forms are protected from spam by Cloudflare Turnstile.</p></li>',
         '<li><p><strong>When you use the site</strong>: statistics about visits, collected with PostHog on its servers in the European Union: which pages are opened, where a visit comes from (Instagram, for example), the type of device and browser, the country and city worked out from the IP address, how many people press the booking button and how many end up with a place, and which posts are read to the end. We do not send your name, your email address or anything you type into a form, we use no cookies and we save nothing in your browser, so we cannot recognise you from one visit to the next. If your browser sends the Global Privacy Control or Do Not Track signal, the visit is not counted. The legal basis is our legitimate interest in knowing which content is useful. The forms are protected from spam by Cloudflare Turnstile.</p></li>'
       )) as change (drafted, revised)
 where key = 'legal.privacy'
   and strpos(value_en, change.drafted) > 0
   and strpos(value_en, change.revised) = 0;

-- ---------------------------------------------------------------------------
-- 2. How long they are kept
-- ---------------------------------------------------------------------------
-- PostHog keeps events for a period its plan sets: a year on the free plan,
-- seven on a paid one (posthog.com/docs/data/events-retention).
update public.site_content
   set value_ro = replace(value_ro, change.drafted, change.revised)
  from (values (
         '<li><p>Mesajele din formularul de contact: până se încheie discuția, cel mult un an.</p></li>',
         '<li><p>Mesajele din formularul de contact: până se încheie discuția, cel mult un an.</p></li><li><p>Statisticile de vizitare: cât le păstrează PostHog pentru site, un an pe planul gratuit.</p></li>'
       )) as change (drafted, revised)
 where key = 'legal.privacy'
   and strpos(value_ro, change.drafted) > 0
   and strpos(value_ro, change.revised) = 0;

update public.site_content
   set value_en = replace(value_en, change.drafted, change.revised)
  from (values (
         '<li><p>Contact form messages: until the conversation ends, and at most one year.</p></li>',
         '<li><p>Contact form messages: until the conversation ends, and at most one year.</p></li><li><p>Visitor statistics: as long as PostHog keeps them for the site, one year on its free plan.</p></li>'
       )) as change (drafted, revised)
 where key = 'legal.privacy'
   and strpos(value_en, change.drafted) > 0
   and strpos(value_en, change.revised) = 0;
