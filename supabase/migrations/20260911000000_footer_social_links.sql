-- ---------------------------------------------------------------------------
-- The footer's social links
-- ---------------------------------------------------------------------------
--
-- WHAT WAS WRONG
--
-- The admin panel had a section called "General" holding two fields, and
-- neither of them appeared anywhere on the site. `contact.instagram_url` and
-- `contact.email` were seeded, editable, declared in lib/site-content.ts and
-- returned by getSiteContent() — and read by no component. The footer
-- meanwhile hardcoded `href="#"` on both its Instagram and its Facebook icon.
--
-- So the storage and the editing screen were built and the consuming half never
-- was. From her side it looked like a section that did nothing, because it did.
--
-- WHAT THIS CHANGES
--
--   * 'general' becomes 'footer'. The heading in the admin panel is generated
--     from this column — the screen does `select distinct section` — so the
--     word "General" existed only because these rows said so. "Footer" names
--     the place the values actually come out.
--
--   * `contact.email` goes. Nothing displayed it, and nothing is going to:
--     contact runs through the form on /contact, which is rate-limited and
--     behind a CAPTCHA. A second, plain-text address in the footer would be the
--     one an address harvester can read. If she had typed anything into that
--     field it was never shown to a visitor, so nothing visible is lost.
--
--   * `contact.facebook_url` arrives to replace it, because the footer has had
--     a Facebook icon since the beginning with no field behind it.
--
-- The labels say what the field will accept. She is as likely to type "@nume"
-- as to paste a full address, and lib/social.ts turns either into a working
-- link — but saying so in the label is cheaper than her finding out.

begin;

-- Rename first, so the insert below lands in a section that already exists and
-- the admin screen never renders a half-migrated pair of headings.
update public.site_content
   set section = 'footer'
 where section = 'general';

delete from public.site_content
 where key = 'contact.email';

update public.site_content
   set label_ro   = 'Instagram (link sau @nume)',
       sort_order = 10,
       updated_at = now()
 where key = 'contact.instagram_url';

insert into public.site_content
  (key, section, sort_order, field_type, label_ro, value_ro, value_en)
values
  ('contact.facebook_url', 'footer', 20, 'text', 'Facebook (link sau nume pagină)', '', null)
on conflict (key) do nothing;

-- The baseline's inline comment on this column still lists 'general' as one of
-- the three groups. Restating it here rather than editing the baseline, which
-- is frozen; 99999999999999_object_comments.sql does not describe this column,
-- so re-pasting that file will not undo this.
comment on column public.site_content.section is
  'Groups fields under a heading in the admin content screen: ''home'', ''about'', ''footer''. '
  'The heading text comes from SECTION_LABELS in app/admin/content/page.tsx; an unrecognised '
  'value falls back to showing this string as-is.';

commit;
