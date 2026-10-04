-- ===========================================================================
-- A testimonial outlives its event
-- ===========================================================================
--
-- What this changes, and why: deleting an event used to delete every
-- testimonial written about it (the foreign key cascaded). She can now delete
-- past events from the admin, and what people said about one should not
-- vanish with it. So the testimonial stays, loses the link, and keeps the
-- event's title and date, copied onto it the moment the event is deleted.
--
--   testimonials.event_id        Now nullable; deleting the event sets it to
--                                NULL instead of deleting the testimonial.
--   testimonials.event_title_ro  The deleted event's titles and date. Empty
--   testimonials.event_title_en  while the event exists: the event itself is
--   testimonials.event_date      the source then, so a renamed event is never
--                                shown under its old name.
--
-- A testimonial therefore always has one or the other, which a CHECK makes
-- sure of.

alter table public.testimonials
  add column event_title_ro text,
  add column event_title_en text,
  add column event_date     date;

alter table public.testimonials alter column event_id drop not null;

alter table public.testimonials
  drop constraint testimonials_event_id_fkey,
  add constraint testimonials_event_id_fkey
    foreign key (event_id) references public.events (id) on delete set null,
  add constraint testimonials_names_an_event
    check (event_id is not null or event_title_ro is not null);

comment on column public.testimonials.event_id is
  'The event it is about. NULL once that event has been deleted; event_title_ro and event_date then say which it was.';
comment on column public.testimonials.event_title_ro is
  'The Romanian title of the event, copied when the event was deleted. NULL while the event exists.';
comment on column public.testimonials.event_title_en is
  'The English title of the event, copied when the event was deleted.';
comment on column public.testimonials.event_date is
  'The date of the event, copied when the event was deleted.';

-- ---------------------------------------------------------------------------
-- The copy, made as the event goes
-- ---------------------------------------------------------------------------
-- BEFORE DELETE: it runs while the event row still exists, and before the
-- foreign key clears event_id, so the testimonials can still be found by it.
-- It runs as whoever deletes the event, so the admin-only policies on
-- testimonials apply to the copy as they do to the delete.
create function public.keep_event_on_testimonials()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.testimonials t
     set event_title_ro = old.title_ro,
         event_title_en = old.title_en,
         event_date     = old.date
   where t.event_id = old.id;
  return old;
end;
$$;

-- Only its trigger runs it. `from public`, because Postgres grants EXECUTE to
-- PUBLIC at creation (tests/rpc-exposure.spec.ts).
revoke all on function public.keep_event_on_testimonials() from public;
revoke all on function public.keep_event_on_testimonials() from anon, authenticated, service_role;

comment on function public.keep_event_on_testimonials() is
  'Trigger function: before an event is deleted, copies its titles and date onto its testimonials, which the foreign key then unlinks.';

create trigger events_keep_title_on_testimonials
  before delete on public.events
  for each row execute function public.keep_event_on_testimonials();
