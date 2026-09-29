-- ===========================================================================
-- The inbox: searching messages
-- ===========================================================================
--
-- The Mesaje page (app/admin/(panel)/messages/page.tsx) shows the contact
-- form's messages in three tabs, 25 to a page, with a search box. The
-- database does the filtering and the paging, as it does for Registrations,
-- because messages only pile up until she deletes them.
--
-- What this adds to contact_messages:
--
--   search_text  The sender's name and address, the subject and the message,
--                lowercased and without accents. The page lowers and strips
--                what she types the same way (searchable() in
--                lib/search-text.ts), so "ionut" finds "Ionuț" and
--                "respiratie" finds "respirație". The letters are the ones
--                admin_participants folds for the Registrations search.
--
-- It is a generated column: Postgres writes it from the other four whenever
-- they change, and refuses anything else that tries. The contact form and
-- the admin's updates name their own columns and never this one, but
-- lib/database.types.ts still offers it on Insert and Update (CLAUDE.md, "The
-- generated types offer generated columns on insert and update").
--
-- No index for it. A search reads every message, which for an inbox of
-- hundreds is instant; a trigram index would be the step if that ever
-- changes.
--
-- Access is unchanged. The table's existing grants and its "Admins can
-- manage contact messages" policy cover the new column: the admin reads it,
-- visitors reach nothing, and the contact form still writes through the
-- server with the service key.
--
-- read_at changes meaning slightly: she can now mark a message unread again,
-- so it records when she last opened it or marked it read.

alter table public.contact_messages
  add column search_text text generated always as (
    translate(
      lower(name || ' ' || email || ' ' || coalesce(subject, '') || ' ' || message),
      'ăâîșşțţáàäåãéèëêíìïóòöôõőúùüûűýçñ',
      'aaissttaaaaaeeeeiiioooooouuuuuycn'
    )
  ) stored;

comment on column public.contact_messages.search_text is
  'Name, email, subject and message, lowercased and without accents, for the admin inbox''s search. Generated; nothing writes it.';

comment on column public.contact_messages.read_at is
  'When the admin last opened the message or marked it read; NULL means unread (she can mark it unread again).';
