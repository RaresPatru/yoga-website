-- ===========================================================================
-- Read, starred and archived messages
-- ===========================================================================
--
-- What this adds to contact_messages:
--
--   read_at      When she first opened the message. NULL means unread; the
--                dashboard counts those.
--   starred      Marked to come back to.
--   archived_at  When she archived it. Archived messages leave the inbox but are
--                kept until she deletes them.
--   locale       The language of the page the visitor wrote from ('ro' or
--                'en'), so a reply can be in the right language.
--
-- Access is unchanged: the table's existing grants and its "Admins can manage"
-- policy cover the new columns, and visitors still cannot read any of it. The
-- contact form keeps writing through the server with the service key.

alter table public.contact_messages
  add column read_at timestamptz,
  add column starred boolean not null default false,
  add column archived_at timestamptz,
  add column locale text not null default 'ro'
    constraint contact_messages_locale_check check (locale in ('ro', 'en'));

comment on column public.contact_messages.read_at is
  'When the admin first opened the message; NULL means unread.';
comment on column public.contact_messages.starred is
  'Marked by the admin to come back to.';
comment on column public.contact_messages.archived_at is
  'When the admin archived the message; NULL means it is in the inbox.';
comment on column public.contact_messages.locale is
  'Language of the page the message was sent from: ro or en.';

-- The inbox asks for messages that are not archived, newest first, and the
-- dashboard for the unread ones among them.
create index idx_contact_messages_inbox
  on public.contact_messages (archived_at, read_at, created_at desc);
