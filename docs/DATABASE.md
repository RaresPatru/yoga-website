# Database

What exists, who can touch it, and where to put the next thing.

The schema itself lives in
[`supabase/migrations/00000000000000_baseline.sql`](../supabase/migrations/00000000000000_baseline.sql)
— one file, commented, in dependency order. This page is the map; that file is
the territory. When they disagree, the file is right.

- **Source of truth:** `supabase/migrations/` — the baseline, plus whatever has not been folded into it yet
- **History:** [`supabase/migrations-archive/`](../supabase/migrations-archive/README.md) — every migration that has been applied, kept for the *why*
- **Descriptions:** `99999999999999_object_comments.sql` — a living file, numbered to always sort last. Never folded, never archived.
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
| `events` | Classes, workshops, retreats. The central table. | `select` where `published` | `app/[locale]/events/*`, `app/admin/events` |
| `blog_posts` | Articles. | `select` where `published and not hidden` | `app/[locale]/blog/*`, `app/admin/blog` |
| `testimonials` | Attendee feedback. | `select` where `approved` | home + testimonials pages, `/api/testimonials` |
| `site_content` | Key/value page copy the instructor edits. | `select` (all) | `lib/site-content.ts`, `app/admin/content` |
| `faqs` | Questions on the events page. | `select` where `published` | events page, `app/admin` |
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

`whatsapp_links` is the only table on this schema that is admin-only for
*reading* as well as writing. Anyone holding a WhatsApp invite URL can join the
group, so it is a secret, not a piece of content.

`profiles` is unused. The site has no public sign-up — only the instructor's
admin account — so nothing queries it. It stays because `registrations.user_id`
and `testimonials.user_id` have foreign keys into it.

---

## Functions and the capacity rule

| Object | Runs as | Callable by |
|---|---|---|
| `is_admin()` | definer, `search_path` pinned | `anon`, `authenticated` |
| `pending_hold_interval()` | immutable, returns `1 hour` | `anon`, `authenticated`, `service_role` |
| `register_for_event(...)` | definer, `search_path` pinned | **`service_role` only** |

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
npm run test:e2e
```

Checklist for a new table — the third item is the one people forget:

- [ ] `create table if not exists`
- [ ] `alter table ... enable row level security`
- [ ] **`grant`** for each of `anon` / `authenticated` / `service_role`
- [ ] `drop policy if exists` then `create policy` (idempotent, so it re-runs)
- [ ] Index anything a query filters or orders on
- [ ] `comment on table` / `comment on column` for anything non-obvious
- [ ] A row in the tables above
- [ ] A test that asserts the *refusal*, not just the success path

On that last point: `tests/admin-events.spec.ts` checks that an anonymous client
is **refused outright** on `whatsapp_links` — a hard error, not an empty list.
That distinction is the whole point. An empty list would also pass a naive test
while the table was wide open to a role that simply had no rows to see yet.

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

Note there is deliberately **no** "applied migrations" query. The CLI has never
driven this project and `supabase_migrations.schema_migrations` does not exist
here — a query against it errors, which is more misleading than useful.

### Applying a change

1. Write the migration in `supabase/migrations/`.
2. `npx supabase db reset` and run the suite.
3. Commit it.
4. Paste it into a **new** SQL Editor tab, run it, **delete the tab**.
5. Deploy the code, if the change needs any.
6. Once it is live, it gets folded into the baseline — see below.

### Folding into the baseline

The baseline is only trustworthy if it describes what production actually has,
so a migration is merged into it **after** it has been applied to production,
never before. Folding early would make the baseline assert a schema that does
not exist yet, and a fresh `db reset` would then disagree with the live site.

The cycle, per batch:

1. Migrations accumulate in `supabase/migrations/` as they are written, applied
   and committed. Reading the baseline plus two or three files is fine.
2. When about five have built up — or at a milestone — fold them into the
   baseline and `git mv` the originals to `migrations-archive/`.
3. Prove the fold changed nothing: dump the schema before and after, and diff
   the `CREATE`/`GRANT`/`POLICY`/`COMMENT` lines. They must be identical. This
   is not optional; hand-merging SQL is where a silent divergence gets baked in
   permanently.
4. Run the suite, then commit the fold on its own.

`99999999999999_object_comments.sql` never participates. It is edited in place
when a table or column is added, and re-pasted into the SQL editor like any
other change.

### A note on default privileges

Supabase runs `alter default privileges in schema public grant all on tables to
anon`, so every table carries `REFERENCES, TRIGGER, TRUNCATE, MAINTAIN` for
`anon` unless explicitly revoked. Those verbs are not reachable through
PostgREST, which only issues `SELECT`/`INSERT`/`UPDATE`/`DELETE`, and no
`SELECT` is granted on the private tables — so they stay unreadable. It looks
alarming in a grants dump and is the default posture on every Supabase project.
