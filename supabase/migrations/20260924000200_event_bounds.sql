-- ===========================================================================
-- When an event starts and ends, as moments in time
-- ===========================================================================
--
-- What this adds to events:
--
--   starts_at, ends_at  The event's start and end as absolute instants
--                       (timestamptz). Postgres computes them from the
--                       wall-clock columns date, time, end_date and end_time,
--                       which are Europe/Bucharest local times, and nobody can
--                       write them directly.
--   show_in_archive     Whether a past event appears in the public archive of
--                       past events. On by default; she can hide one.
--
-- Why: "has this event ended?" decides the dashboard's count of active events,
-- which events move to the archive, when booking closes and when reviews open.
-- Until now each place worked it out for itself from the wall-clock columns,
-- and the public lists used the start, so a weekend retreat dropped off them
-- the moment it began, and nothing used the end at all. Postgres now computes
-- both once, in the time zone the columns are written in, and every query can
-- read the answer.
--
-- The rules, in plain words:
--
--   starts_at  the start date at the start time, or at midnight when she has
--              not announced a time yet.
--   ends_at    the last day (end_date, or the start date for a one-day event)
--              at end_time; with no end time, midnight after that last day.
--              An event with no end time therefore counts as running for its
--              whole last day: it stays on the dashboard a few hours too long
--              rather than leaving it early.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------
-- `generated always as (...) stored` makes Postgres compute the value on every
-- insert and update, and store it like any other column so it can be indexed.
-- Writing to it directly is an error, so it can never disagree with the four
-- columns it comes from. Adding the columns fills them in for every event that
-- already exists.
--
-- `date + time` gives a timestamp with no zone: a wall-clock reading.
-- `at time zone 'Europe/Bucharest'` says which clock it was read from and turns
-- it into an instant. Postgres knows the daylight-saving rules, so the hour
-- that moves in March and October is handled here rather than in JavaScript.
--
-- One thing a stored value cannot follow: if Romania ever changes its clocks
-- (the EU has debated ending daylight saving), the instants already stored for
-- future events keep the old rule until each row is next saved.
alter table public.events
  add column starts_at timestamptz not null
    generated always as (
      (date + coalesce(time, time '00:00')) at time zone 'Europe/Bucharest'
    ) stored,
  add column ends_at timestamptz not null
    generated always as (
      case
        when end_time is not null then
          (coalesce(end_date, date) + end_time) at time zone 'Europe/Bucharest'
        else
          (coalesce(end_date, date) + 1 + time '00:00') at time zone 'Europe/Bucharest'
      end
    ) stored,
  add column show_in_archive boolean not null default true;

comment on column public.events.starts_at is
  'Start as an instant: date + time (midnight when time is NULL) in Europe/Bucharest. Generated; never written directly.';
comment on column public.events.ends_at is
  'End as an instant: last day + end_time, or midnight after the last day when end_time is NULL, in Europe/Bucharest. Generated; never written directly.';
comment on column public.events.show_in_archive is
  'Whether this event is listed in the public archive of past events once it has ended.';

-- ---------------------------------------------------------------------------
-- 2. An event ends after it starts
-- ---------------------------------------------------------------------------
-- The two checks from 20260919000000_event_end.sql let one case through: a
-- one-day event (no end_date) whose end time is before its start time, such as
-- 18:00 to 10:00. That is always a typo, and it would make the event count as
-- over before it began. Comparing the two instants covers every case, across
-- days included.
--
-- `not valid` means Postgres enforces the rule on every insert and update from
-- now on but does not re-check the rows already there. A test event in
-- production with such a typo would otherwise stop this whole migration from
-- applying. Saving such an event again means fixing it.
alter table public.events
  add constraint events_ends_after_start check (ends_at > starts_at) not valid;

-- ---------------------------------------------------------------------------
-- 3. Who may read and write them
-- ---------------------------------------------------------------------------
-- Nothing to grant. Column privileges come from the table's grants unless a
-- column list narrows them, and none does, so the baseline's grants on
-- public.events cover these columns, and its row policies decide which rows
-- each role sees.

-- Most lists ask for published events that have not ended yet, soonest first.
create index idx_events_published_ends_at on public.events (published, ends_at);
