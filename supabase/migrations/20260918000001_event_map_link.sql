-- ---------------------------------------------------------------------------
-- Where the event actually is
-- ---------------------------------------------------------------------------
--
-- `location` is the human answer — "Parcul Central, Cluj-Napoca" — and it stays
-- exactly that: the line printed on the page. This adds the machine answer
-- beside it, so the name on the page can open a map.
--
-- One free-text column rather than a latitude and a longitude, because of how
-- she will actually produce it. Getting coordinates out of a phone means
-- knowing that long-pressing a map drops a pin and that the numbers under it
-- can be copied. Getting a link means pressing Share, which she already does
-- twenty times a day. So the field takes either:
--
--     https://maps.app.goo.gl/xY7...   whatever Google's Share button gave her
--     46.7712, 23.5949                 for a field with no address to search
--
-- and lib/map-link.ts decides which it is. A pasted link is used as given; a
-- coordinate pair is turned into a map URL. Anything else is ignored rather
-- than rendered, because the alternative is a link on the page that goes
-- nowhere.
--
-- NULL means she has not supplied one, and the address is then plain text. That
-- is the ordinary case and not a gap to be filled with a guess: searching a map
-- for a name she did not choose to pin is how a visitor ends up at the wrong
-- Parcul Central.

alter table public.events add column if not exists map_link text;

-- ---------------------------------------------------------------------------
-- Who may read and write it
-- ---------------------------------------------------------------------------
-- Nothing to do, and that is worth stating rather than leaving as an absence.
--
-- Postgres grants privileges on a *table*, not on a column, unless somebody has
-- deliberately narrowed them to a column list — and nothing here has. So this
-- column is already covered by the grants the baseline put on `public.events`:
--
--     anon           select
--     authenticated  select, insert, update, delete
--     service_role   select, insert, update, delete
--
-- and by the row-level policies that decide which rows each of those sees. A
-- visitor reads it on a published event because they can already read published
-- events; an administrator writes it because they can already write events.
--
-- The rule in CLAUDE.md is to state what every role may do in the migration
-- that creates the object. Re-granting here would be worse than saying it: it
-- would suggest this column has privileges of its own to get out of step with
-- the rest of the table.

comment on column public.events.map_link is
  'Optional. A map URL she pasted, or a "lat, lng" pair. Parsed by lib/map-link.ts; anything unrecognised is ignored. NULL means the address renders as plain text.';
