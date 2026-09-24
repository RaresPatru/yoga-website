# Database

What exists, who can touch it, and where to put the next thing.

The schema itself lives in
[`supabase/migrations/00000000000000_baseline.sql`](../supabase/migrations/00000000000000_baseline.sql)
— one file, commented, in dependency order. This page is the map; that file is
the territory. When they disagree, the file is right.

- **Source of truth:** `supabase/migrations/` — the baseline (frozen since September 2026) plus every dated migration after it
- **History:** [`supabase/migrations-archive/`](../supabase/migrations-archive/README.md) — every migration that has been applied, kept for the *why*
- **Descriptions:** `20260912000001_object_comments.sql` — 30 `COMMENT ON` statements, collected in one file rather than folded into the baseline. No longer edited in place; a new object needs a new dated migration.
- **The Supabase SQL Editor holds no schema.** See [Working with production](#working-with-production).

---

## The one rule that keeps biting

Postgres checks **two** things before a query runs:

1. **GRANT** — may this role touch this table at all?
2. **RLS** — which rows may it touch?

Both must pass, and they fail differently. A missing grant is a loud
`permission denied`. A missing policy is **silence** — RLS is a filter, so rows
you may not see are simply absent, and the query returns an empty list with no
error.

That asymmetry has cost real time here. An empty list is not evidence that a
table is empty; it is equally consistent with having no permission to read it.
The `event_availability` view exists because a client-side count of
`registrations` returned `0` for every event for weeks, and `count || 0` made it
look healthy.

**Write the grant at the same time as the policy.** Two features shipped broken
because only one of the two was done.

---

## Tables

### Public content — anyone reads, admins write

| Table | Holds | anon | Touched by |
|---|---|---|---|
| `events` | Classes, workshops, retreats. The central table. | `select` where `published` | `app/[locale]/events/*`, `app/admin/(panel)/events` |
| `blog_posts` | Articles. | `select` where `published and not hidden` | `app/[locale]/blog/*`, `app/admin/(panel)/blog` |
| `testimonials` | Attendee feedback. | `select` where `approved` | home + testimonials pages, `/api/testimonials` |
| `site_content` | Key/value page copy the instructor edits. | `select` (all) | `lib/site-content.ts`, `app/admin/(panel)/content` |
| `faqs` | Questions on the home page. | `select` where `published` | home page, `app/admin/(panel)/content` |
| `event_availability` | **View.** `(event_id, capacity, taken)`. | `select` | every page showing seat counts |

### Private — admins only, no public policy in either direction

| Table | Holds | Why locked | Written by |
|---|---|---|---|
| `registrations` | Name, email, phone per signup. | Personal data | `register_for_event()` only |
| `contact_messages` | Contact-form messages. | Private correspondence | `/api/contact` (service key) |
| `waiting_list` | Who is waiting, plus their claim window. | Personal data | `/api/register/waiting-list` |
| `waiting_list_notifications` | Audit log of notified batches. | Operational | Stripe webhook |
| `email_templates` | Transactional email bodies. | Editable config | `/admin/emails` |
| `whatsapp_links` | Saved invite URLs. | **A URL is a capability** | `/admin/events` |
| `admins` | Who may enter `/admin`. | Revoked from everyone; read only by `is_admin()` | by hand |
| `profiles` | Extra auth fields. | Vestigial — see below | nothing |
| `admin_dashboard` | **View.** One row: the dashboard's five counts. | `security_invoker`; `select` for `authenticated` only | the dashboard (reads) |
| `admin_event_overview` | **View.** Per event: people waiting in line, payments pending. | `security_invoker`; `select` for `authenticated` only | the dashboard (reads) |

`whatsapp_links` is the only table on this schema that is admin-only for
*reading* as well as writing. Anyone holding a WhatsApp invite URL can join the
group, so it is a secret, not a piece of content.

`profiles` is unused. The site has no public sign-up — only the instructor's
admin account — so nothing queries it. It stays because `registrations.user_id`
and `testimonials.user_id` have foreign keys into it.

The two `admin_*` views (`20260924000400_admin_dashboard.sql`) are
`security_invoker`, the opposite of `event_availability` below: they run with
the permissions of whoever asks, so the admin-only row policies underneath still
decide what they count. Anyone signed in who is not the admin would see only the
published events and zero for everything else, and `anon` has no grant at all.
A pending payment is defined once, per event, in `admin_event_overview`, and the
dashboard's total is its sum.

**When an event starts and ends.** `events.starts_at` and `events.ends_at` are
generated columns (`20260924000200_event_bounds.sql`): Postgres computes them
from `date`, `time`, `end_date` and `end_time` in Europe/Bucharest and refuses
any write to them. A blank start time counts as midnight; a blank end time means
the event runs to the end of its last day. Supabase's generated types do not
know they are read-only, so a writer that spreads a whole row into an update
must leave them out. `events_ends_after_start` requires the end to come after
the start (added `not valid`: enforced on every write from then on, without
re-checking old rows). `show_in_archive` decides whether a past event is listed
in the public archive.

**Message state.** `contact_messages` gained `read_at` (NULL means unread),
`starred`, `archived_at` and `locale` (`20260924000300_message_state.sql`).

**Site content keys are described in code.** Which keys exist, and what each
is for, lives in `lib/site-content-schema.ts`, not in the table: the admin
creates a key's row the first time she saves it. The `section`, `label_ro`
and `field_type` columns are written from the schema on every save and are
not read by the site. The three legal documents are rows too
(`legal.privacy`, `legal.terms`, `legal.cookies`), seeded as drafts by
`20260925000000_faq_hidden_and_legal_drafts.sql`, which also makes
`faqs.published` default to false: a new question stays hidden until she
publishes it.

---

## Functions and the capacity rule

| Object | Runs as | Callable by |
|---|---|---|
| `is_admin()` | definer, `search_path` pinned | `anon`, `authenticated` |
| `pending_hold_interval()` | immutable, returns `1 hour` | `anon`, `authenticated`, `service_role` |
| `register_for_event(...)` | definer, `search_path` pinned | **`service_role` only** |
| `set_updated_at()` | trigger function, `search_path` pinned | nobody; only its triggers run it |

`set_updated_at()` runs before every UPDATE on `events`, `blog_posts`,
`site_content` and `email_templates`, and stamps `updated_at` with the current
time (`20260924000000_updated_at_triggers.sql`). No screen has to remember to
set the column, which is how the sitemap's dates stayed frozen at creation.

**Flags and timestamps are `NOT NULL`** since
`20260924000100_required_flags_and_timestamps.sql`: `published`, `hidden`,
`approved`, `payment_status`, and the `created_at`/`updated_at` columns that had
defaults but still allowed NULL. The TypeScript types in
`lib/database.types.ts` are generated from this schema
(`npx supabase gen types typescript --local > lib/database.types.ts`, after
every migration), so what the database promises is what the code can rely on.

> **Every function in `public` is an HTTP endpoint.** PostgREST exposes it at
> `/rest/v1/rpc/<name>` to any role holding EXECUTE, so the function ACL is part
> of the site's attack surface.
>
> And `revoke all on function ... from anon, authenticated` **does not** make a
> function private. Postgres grants EXECUTE to `PUBLIC` on creation; revoking
> named roles leaves that inherited grant untouched, and `pg_dump` does not
> print default PUBLIC grants, so the dump looks correct. `register_for_event`
> was callable by anyone for a month because of this — with
> `p_payment_status => 'completed'`, that is a free booking on a paid event.
>
> Always `revoke all on function ... from public;` first, then grant to the
> roles that need it. Check with:
>
> ```sql
> select proname, proacl from pg_proc p
>   join pg_namespace n on n.oid = p.pronamespace
>  where n.nspname = 'public';
> ```
>
> A leading `=X/postgres` in the ACL means PUBLIC holds EXECUTE.
> `tests/rpc-exposure.spec.ts` asserts the refusal over HTTP.

`register_for_event()` is the only way a registration row is created. It counts
and inserts inside one transaction with `FOR UPDATE` on the event row, which is
what stops two simultaneous bookings both seeing the last free seat. `anon` and
`authenticated` are explicitly revoked: the browser reaches it through
`/api/register`, which is where the CAPTCHA and the validation live.

**A seat is held when:** `payment_status <> 'refunded'` **and**
(`payment_status <> 'pending'` **or** the row is younger than
`pending_hold_interval()`).

That rule is written twice — in `event_availability` and in
`register_for_event()` — and the two **must** stay identical. When the number a
page displays and the rule the button enforces disagree, you get a page offering
seats next to a button that refuses them.

### Why `event_availability` is not `security_invoker`

The view runs with its creator's privileges, so it can read `registrations` even
though the caller cannot. That is deliberate and it is the only reason the seat
count works. It is safe because the view returns no row-level data — an event
id, a capacity, a count, and nothing that could leak a name or an email.
Aggregation is the privacy boundary. Turning on `security_invoker` would filter
the registrations away again and every event would read zero.

Supabase's linter flags this view. It is a known, accepted finding.

---

## Storage

One public bucket, `media`. Size and MIME limits are set **on the bucket**, not
in the API route, because uploads go browser → Supabase directly via a signed
URL that `/api/upload` issues after checking the admin session. The browser
never passes back through our code, so a check in the route is only a
suggestion.

`image/svg+xml` is deliberately excluded: an SVG is XML and can carry `<script>`,
so serving one from a public bucket is stored XSS.

`authenticated` holds `select, insert, delete` on `storage.objects` and
`storage.buckets` because `components/admin/media-library.tsx` lists and deletes
from the browser with the user's own session. **This grant lived only in
production for a month** — it had been run by hand in the dashboard and was in
no migration, so a fresh local database had a media library that came back empty
while the Supabase dashboard showed the files sitting there perfectly fine.

Listing is restricted to `authenticated` by the
`"Signed-in users can list media files"` policy. Serving is unaffected: requests
to `/storage/v1/object/public/media/...` never consult RLS — that is what makes
a bucket public — so the policy only ever governed whether a client could
*enumerate* the bucket. Anonymous visitors load images fine and cannot list.

---

## Adding something new

Do not edit the baseline. Write a new dated migration.

```bash
npx supabase migration new descriptive_name
# edit supabase/migrations/<timestamp>_descriptive_name.sql
npx supabase db reset      # replays everything from scratch
npx supabase gen types typescript --local > lib/database.types.ts
npm run test:e2e
```

The third line regenerates the TypeScript types every Supabase client uses. Skip
it and the code keeps compiling against the old schema: a renamed column still
type-checks, then fails at run time.

Checklist for a new table — the third item is the one people forget:

- [ ] `create table` — not `if not exists`: a migration runs exactly once, and `if not exists` would silently skip a table that already exists in another shape
- [ ] `alter table ... enable row level security`
- [ ] **`revoke all ... from anon, authenticated`, then grant back only what is needed**
- [ ] For a function: **`revoke all on function ... from public`** first — see "Every function in `public` is an HTTP endpoint" above
- [ ] **`grant`** for each of `anon` / `authenticated` / `service_role`
- [ ] `drop policy if exists` then `create policy` (idempotent, so it re-runs)
- [ ] Index anything a query filters or orders on
- [ ] `comment on table` / `comment on column` for anything non-obvious
- [ ] A row in the tables above
- [ ] A test that asserts the *refusal*, not just the success path

**Why the revoke comes first, and is not optional.** Supabase's project setup
runs `alter default privileges in schema public grant all on tables to anon`.
On the local stack, every table you create inherits *all* privileges for
`anon` — SELECT, INSERT, UPDATE and DELETE — before you have written a single
grant. Re-verified on 22 September 2026 with CLI 2.117.0, despite a comment in
`supabase/config.toml` suggesting new tables are no longer exposed by default.
Production grants less by default; see the last section. Nothing in this
repository says so, and `pg_dump` does not print default privileges as table
grants, so the only way to see it is to ask a freshly built database:

```sql
select table_name, string_agg(privilege_type, ', ' order by privilege_type)
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
group by table_name order by table_name;
```

Anything other than `SELECT` in that output is a table that was never revoked.
Five were found this way in September 2026 — `whatsapp_links`, `site_content`,
`faqs`, `profiles` and `event_availability` — all closed by
`20260905000000_revoke_default_anon_grants.sql`.

**Run it against both databases, because they answered differently.** Production
carried `REFERENCES, TRIGGER, TRUNCATE` on those five and never had anon
INSERT/UPDATE/DELETE; the same migrations replayed on a current CLI produced
full DML for anon instead. Neither was exploitable — RLS held in both — but the
baseline exists to rebuild production exactly, and on these five objects it had
stopped doing that. A CI failure was the only thing that noticed, because CI is
the only place that builds the schema from scratch every time.

That is also the limit of the `db dump` comparison described above: `pg_dump`
does not print default privileges as table grants, so a diff of two dumps shows
these tables as identical while the live privileges differ. The August
verification reported a clean match and was reading a file that could not
contain the discrepancy. Ask `information_schema`, not the dump, whenever the
question is "who can do what".

On the last checklist item: `tests/admin-events.spec.ts` checks that an
anonymous client is **refused outright** on `whatsapp_links` — a hard error, not
an empty list. That distinction is the whole point, and it is what caught the
grants above. An empty list would also pass a naive test while the table was
wide open to a role that simply had no rows to see yet.

### Constraints that can fail on data

A `CHECK` is validated against every existing row. Adding one is the only kind
of migration here that can fail because of *data* rather than schema — it
happened with `events_capacity_positive`, which was rejected by a test event
saved with `max_participants = -2`. Repair the rows in the same migration,
before the constraint:

```sql
update public.events set max_participants = null
 where max_participants is not null and max_participants <= 0;
```

> The lesson stands; do not copy that statement. `events_capacity_positive` was
> replaced by `events_capacity_non_negative` in
> `20260918000000_capacity_is_required.sql`, because zero became a legal
> capacity meaning "sold out" — so this repair would now erase a deliberate
> value. A repair has to be written against the rule you are introducing.

---

## Working with production

Production is a live Supabase project wired to Vercel. `main` deploys on push,
so **schema goes first, code second** — deploy a column-reading query before the
column exists and every page using it 500s.

### The SQL Editor is a scratchpad, not a record

It stores what you *typed*, not what the database *is*. Run a statement in one
tab and not another and they disagree, with nothing to tell you which is live.
Twenty tabs named "Untitled query" is how three different versions of
`register_for_event` ended up looking equally authoritative — and because the
newest was pasted at the top, running them in order would have reinstated the
oldest.

The cost of that drift is not theoretical. Production ran a hand-edited version
of the waiting-list migration whose policies were named in lowercase
(`"authenticated can read waiting_list"`) while the repo's version used
different wording. When the RLS hardening later ran `drop policy if exists` on
the repo's names, it matched nothing and reported nothing — `if exists` is
exactly what made it silent. Three policies survived, one of which let any
logged-in account read every waiting-list row. It took a mechanical dump-and-
diff to find, a month later. Nobody catches that by reading.

So: **keep nothing there that changes anything.** Four saved diagnostics, all
read-only, prefixed so they sort together:

```sql
-- check · admins
-- Who can reach /admin. Anyone here who should not be, delete.
select * from public.admins;


-- check · function ACLs
-- The one that matters most. Every function in `public` is an HTTP endpoint at
-- /rest/v1/rpc/<name>, callable by any role holding EXECUTE. A leading `=X/`
-- with an EMPTY grantee means PUBLIC — i.e. everyone, including anon — and
-- `pg_dump` does not print it. register_for_event carried that for a month:
-- anyone with the publishable key could book a paid event for free.
-- register_for_event should list postgres and service_role, and nothing else.
select p.proname, coalesce(array_to_string(p.proacl, '  |  '), '(default: PUBLIC can execute)') as acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by p.proname;


-- check · policies still using auth.role()
-- Should return no rows. `auth.role() = 'authenticated'` means "is logged in",
-- not "is an admin", and was the original privilege-escalation bug here.
select tablename, policyname, qual
  from pg_policies
 where schemaname = 'public' and qual like '%auth.role()%';


-- check · every policy, by table
-- Read this after any dashboard change. A policy present here and absent from
-- supabase/migrations is drift, and that is exactly how three policies letting
-- any logged-in account read the waiting list survived for a month.
select tablename, policyname, cmd, roles::text, qual
  from pg_policies
 where schemaname in ('public', 'storage')
 order by tablename, policyname;


-- check · grants by role
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privs
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
 group by grantee, table_name
 order by grantee, table_name;
```

There is no saved "applied migrations" query because the CLI answers that
better: `npx supabase migration list --linked`. The ledger behind it,
`supabase_migrations.schema_migrations`, has existed since 11 September 2026.

### Applying a change

1. Write the migration in `supabase/migrations/`.
2. `npx supabase db reset` and run the suite.
3. Commit it.
4. `npx supabase db push` — applies every migration the remote has no record of,
   in filename order, inside a transaction. `--dry-run` first to see the list.

   If it ever refuses with `LegacyDbPushMissingRemoteError`, a local migration
   sorts *before* the last one the remote has applied. `--include-all` overrides
   that check; prefer renaming the file to a later timestamp, because the check
   is worth keeping.
5. Deploy the code, if the change needs any.
6. Leave the file where it is. Migrations stay in `supabase/migrations/` for
   good — see "The baseline is frozen" below.

The remote has had a migration ledger since 11 September 2026. Before that it
had none, and every change went in through the SQL Editor by hand.
`npx supabase migration list --linked` shows the state; every row should carry a
`remote` version.

**If that column is ever blank again, stop.** `db push` would read "no
migrations applied", conclude the database is blank, and replay the baseline
over a live schema.

Two things the ledger changes:

- **A recorded migration is never re-applied.** So
  `20260912000001_object_comments.sql` can no longer be edited in place and
  re-run — `db push` will skip it and the change never reaches production. Write
  a dated migration for comment changes instead.
- **`supabase db reset --linked` is now a live command.** `--linked` means
  production, and it drops everything: data, `auth.users` including the account
  you sign in with, and Storage. If it is ever genuinely wanted, `--no-seed` is
  not optional — `seed.sql` creates an administrator whose password is written
  in plain text in this repository.

#### How the ledger was created

With `migration repair`, which records history without touching schema. On
11 September 2026 that meant the migrations that existed on that day and had
already been applied by hand through the SQL Editor:

```bash
npx supabase migration repair --linked --status applied <version> [<version> ...]
```

The versions are deliberately not written out here. This is a recipe for
rebuilding a ledger, not a transcript — the set is "whatever is already applied
at the moment you run it", and copying a list from documentation is how you come
to assert that a migration written later was applied earlier. Everything added
since that day reached production through `npx supabase db push` and recorded
itself, which is the whole point of having a ledger.

`repair --status applied` asserts a migration has already run, so it is only
honest if it really has. That was checked first, by dumping both schemas and
diffing:

```powershell
npx supabase db dump --linked -f prod-schema.sql
npx supabase db dump --local  -f local-schema.sql
git diff --no-index prod-schema.sql local-schema.sql   # not `diff`: in PowerShell that is Compare-Object, which compares the two names
```

77 lines differed, in three categories and none of them structural: comment text
inside `register_for_event` (the code is byte-identical), physical column order
on three tables that had gained columns through `ALTER TABLE ADD COLUMN`, and
grants where production is *narrower* than local. Object inventories matched
exactly — 13 tables, 18 policies, 11 indexes, 25 constraints, 3 functions, same
names on both sides.

Delete the dumps afterwards. They are a snapshot that goes stale immediately,
and a full one carries real people's names and email addresses. `.gitignore`
does not cover these two file names, so a stray `git add -A` would commit them.

### The baseline is frozen — nothing is folded into it any more

Folding used to be the routine: once a few migrations had reached production,
merge them into the baseline and `git mv` the originals to
`migrations-archive/`. Since production gained a migration ledger on
11 September 2026 that routine is unsafe, for two reasons:

- **It breaks `db push`.** The ledger records every version it applied. Move a
  file out of `supabase/migrations/` and the remote holds a version the local
  folder no longer has, so the next `npx supabase db push` refuses to run until
  each folded version is marked `reverted` with `migration repair`.
- **The baseline is already applied.** Production recorded `00000000000000` as
  done, so editing that file changes nothing live — which is why CLAUDE.md
  forbids editing it.

So every change stays a dated migration, permanently. The price is that the
current schema is the baseline *plus* every file after it, and the baseline's
own comments describe 11 September 2026 — "NULL capacity means unlimited", for
one, which `20260918000000_capacity_is_required.sql` reversed. Read the later
migrations before trusting a baseline comment.

If the list ever grows unwieldy, squashing is still possible — as a planned
operation agreed with Rares, not a habit: dump production's schema, write the
new baseline from it, prove the two identical by diffing, and repair the ledger
in the same sitting (`migration repair --linked --status reverted` for the old
versions, `--status applied` for the new baseline).

Object descriptions follow the same rule. `20260912000001_object_comments.sql`
is history now; describing a new object, or correcting an old description,
means a new dated migration with the `comment on` lines in it.

### A note on default privileges

Supabase runs `alter default privileges in schema public grant all on tables to
anon`, so every table carries `REFERENCES, TRIGGER, TRUNCATE, MAINTAIN` for
`anon` unless explicitly revoked. Those verbs are not reachable through
PostgREST, which only issues `SELECT`/`INSERT`/`UPDATE`/`DELETE`, and no
`SELECT` is granted on the private tables — so they stay unreadable. It looks
alarming in a grants dump and is the default posture on every Supabase project.

### A migration that creates a table must state its grants

Do not let a new table inherit whatever the default privileges happen to be.
The two databases disagree about those, and the disagreement is silent in both
directions:

```
production   ALTER DEFAULT PRIVILEGES ... GRANT REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON TABLES
local        ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES
```

A bare `create table public.thing (...)` therefore produces a table `anon` can
read *and write* on the local stack — measured: `DELETE, INSERT, SELECT,
UPDATE` — and a table nobody can touch in production. The first looks like it
works, and the second only fails once it is live.

So every new table gets, in the same migration:

```sql
create table public.thing (...);
alter table public.thing enable row level security;

-- Say it, even when the answer is "nothing".
revoke all on table public.thing from anon, authenticated;
grant select on table public.thing to anon;          -- if it is public content
grant all    on table public.thing to service_role;  -- if a server route writes it

create policy "..." on public.thing for select using (...);
```

`tests/rpc-exposure.spec.ts` enforces the outcome: it asks PostgREST's root
endpoint with the publishable key — which returns exactly what an anonymous
visitor can reach — and fails if anything appears that is not on its list. A
table created the careless way shows up there immediately, by name.
