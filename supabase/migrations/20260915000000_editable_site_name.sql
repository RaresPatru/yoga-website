-- ---------------------------------------------------------------------------
-- The brand name becomes hers to change
-- ---------------------------------------------------------------------------
-- "Yoga Flow" is a placeholder that has been hardcoded in lib/site-config.ts
-- since the beginning, and it is not a developer's decision to make. It is the
-- name of her business. It appears in the header, the footer, every page title,
-- every share card and the structured data a search engine reads — so until now
-- renaming the business meant editing source and redeploying.
--
-- This adds it to the key/value store she already edits under "Conținut site",
-- alongside her Instagram address and her public email.
--
-- NO GRANTS OR POLICIES HERE, AND THAT IS NOT AN OMISSION.
--
-- This is an INSERT into public.site_content, not a new object. That table
-- already carries its own row-level security — anyone may read it, only
-- is_admin() may write it — and its grants were settled when it was created and
-- again in 20260912000000_converge_role_grants.sql. A row inherits both. There
-- is nothing here for a role to be told about that it was not already told.
--
-- WHY value_ro IS EMPTY
--
-- An empty value means "not supplied yet" everywhere else in this table, and
-- the readers treat it that way: lib/site-content.ts drops blank values so a
-- caller can fall through with `??`. So an empty string here leaves the site
-- showing the SITE_NAME placeholder exactly as it does today, and the moment she
-- types a name it takes over. Seeding the placeholder into the database instead
-- would make "Yoga Flow" look like a decision she had made.
--
-- WHY value_en IS NULL
--
-- A business name is not translated. `null` rather than `''` is what the admin
-- screen reads as "this field has no English variant", matching the Instagram
-- and email rows beside it, and lib/site-content.ts falls English back to the
-- Romanian value — so one name serves both languages.
--
-- sort_order 5 puts it above the contact fields already in this section, which
-- start at 10. It is the first thing on the screen because it is the most
-- fundamental thing on it.

insert into public.site_content
  (key, section, sort_order, field_type, label_ro, value_ro, value_en)
values
  ('general.site_name', 'general', 5, 'text', 'Numele site-ului', '', null)
on conflict (key) do nothing;
