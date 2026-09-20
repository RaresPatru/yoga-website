-- ---------------------------------------------------------------------------
-- When an event ends, and the fact that a start time may not be known yet
-- ---------------------------------------------------------------------------
--
-- `date` and `time` said when an event begins and nothing said when it stops.
-- Two things were quietly guessing: the page showed a bare "18:30", so somebody
-- deciding whether they could get there after work had no idea whether to
-- budget an hour or four; and every calendar entry the site produced was ninety
-- minutes long, so a weekend retreat landed in people's calendars as an hour
-- and a half.
--
-- WHY NOT A DURATION IN MINUTES
--
-- That was the first attempt and it was wrong in three ways, all of which show
-- up in ordinary use rather than at the edges:
--
--   * A duration is not what anybody knows. She knows a retreat runs Friday to
--     Sunday; turning that into 2880 is arithmetic homework, and a week is
--     10080, which nobody should be asked to type.
--   * It cannot be shown honestly once it passes a day. 2880 minutes modulo a
--     day is zero, so a retreat starting at nine printed "09:00 – 09:00" — that
--     it lasts no time at all — and the workaround was to print the start alone
--     and hope the description explained. The visitor was told less than the
--     database knew.
--   * It is a derived quantity standing in for the two facts that actually
--     exist. Modelling a thing by something computed from it is what forces the
--     computation back out at every read.
--
-- An end date and an end time are what she has. The duration is the derived
-- value, and it is derived where it is needed (the calendar entry) rather than
-- stored.
--
-- WHY `time` BECOMES NULLABLE
--
-- Because a date can be known before a time is. She books a retreat venue for a
-- weekend in March and announces it months ahead; the day is fixed, the hour is
-- not. `time not null` forced a placeholder — midnight, or a made-up nine
-- o'clock — and a visitor cannot tell a real start time from a filler one. NULL
-- says "not announced yet" and the page then shows no hour at all, which is the
-- truth. She fills it in when she knows, and it appears.
--
-- Nothing is migrated: every existing row keeps its `time`, and both new
-- columns start NULL, which reads as "she has not said" everywhere that matters.

alter table public.events add column if not exists end_date date;
alter table public.events add column if not exists end_time time;

alter table public.events alter column time drop not null;

-- An end before its start is always a typo, and the two halves are separate
-- constraints so the error names which one is wrong.
alter table public.events drop constraint if exists events_end_not_before_start;
alter table public.events add  constraint events_end_not_before_start
  check (end_date is null or end_date >= date);

-- Only meaningful on a single-day event: across days the clock says nothing
-- about order, because 09:00 on Sunday is after 17:00 on Friday.
alter table public.events drop constraint if exists events_end_time_after_start;
alter table public.events add  constraint events_end_time_after_start
  check (
    end_date is null
    or end_date <> date
    or time is null
    or end_time is null
    or end_time > time
  );

-- ---------------------------------------------------------------------------
-- Who may read and write them
-- ---------------------------------------------------------------------------
-- Nothing to do, and worth saying rather than leaving as an absence: privileges
-- in Postgres belong to the table unless somebody narrows them to a column
-- list, and nothing here has. These columns are covered by the grants the
-- baseline put on `public.events` —
--
--     anon           select
--     authenticated  select, insert, update, delete
--     service_role   select, insert, update, delete
--
-- and by the row policies that decide which rows each of those sees. Granting
-- again here would imply these columns have privileges of their own to drift
-- from the rest of the table.
--
-- Dropping NOT NULL from `time` changes no privilege: it is a column
-- constraint, not a permission, and every role that could write the column
-- before can write it now.

comment on column public.events.time is
  'Start time, wall clock in Europe/Bucharest. NULL means not announced yet — the page then shows a date with no hour rather than inventing one.';

comment on column public.events.end_date is
  'Last day of the event. NULL means it ends on the day it starts. Never earlier than date.';

comment on column public.events.end_time is
  'End time, wall clock in Europe/Bucharest. NULL means unstated: the page shows the start alone and the calendar entry falls back to 90 minutes.';
