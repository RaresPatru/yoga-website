-- ===========================================================================
-- Columns that always hold a value are declared NOT NULL
-- ===========================================================================
--
-- What this does: the flags and timestamps below all have defaults, and no
-- screen ever writes NULL into them, but the tables still allowed NULL. This
-- fills any gap with the value the default would have given, then forbids NULL
-- from now on.
--
-- Why it matters:
--
--   * A NULL in `published`, `hidden` or `approved` is a third state nobody
--     designed for. `hidden is not true` and `hidden = false` disagree about
--     it, which is exactly the kind of difference that shows or hides a post
--     by accident.
--   * The TypeScript types are generated from this schema
--     (lib/database.types.ts). While a column allows NULL, every piece of code
--     that reads it has to handle a NULL that never occurs; declaring the truth
--     here makes the types true as well.
--
-- Each UPDATE only touches rows that are actually NULL, so on a clean database
-- it changes nothing. The updated_at trigger from the previous migration stamps
-- any row it does touch, which is correct: that row did change.

-- events -----------------------------------------------------------------
update public.events set published = false where published is null;
update public.events set created_at = now() where created_at is null;
update public.events set updated_at = created_at where updated_at is null;
alter table public.events
  alter column published set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

-- blog_posts -------------------------------------------------------------
update public.blog_posts set published = false where published is null;
update public.blog_posts set hidden = false where hidden is null;
update public.blog_posts set created_at = now() where created_at is null;
update public.blog_posts set updated_at = created_at where updated_at is null;
alter table public.blog_posts
  alter column published set not null,
  alter column hidden set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

-- registrations ----------------------------------------------------------
-- 'free' is the column's default and the only status a row without payment
-- information could have had.
update public.registrations set payment_status = 'free' where payment_status is null;
update public.registrations set created_at = now() where created_at is null;
alter table public.registrations
  alter column payment_status set not null,
  alter column created_at set not null;

-- testimonials -----------------------------------------------------------
update public.testimonials set approved = false where approved is null;
update public.testimonials set created_at = now() where created_at is null;
alter table public.testimonials
  alter column approved set not null,
  alter column created_at set not null;

-- contact_messages -------------------------------------------------------
update public.contact_messages set created_at = now() where created_at is null;
alter table public.contact_messages
  alter column created_at set not null;

-- email_templates --------------------------------------------------------
update public.email_templates set updated_at = now() where updated_at is null;
alter table public.email_templates
  alter column updated_at set not null;
