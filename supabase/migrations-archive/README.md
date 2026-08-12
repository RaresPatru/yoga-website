# Migration history (archived, not replayed)

Every migration that has been applied to production, kept exactly as it ran.
Each one has been folded into
[`../migrations/00000000000000_baseline.sql`](../migrations/00000000000000_baseline.sql)
and moved here — the first sixteen on 11 August 2026, four more on 12 August.

They live *outside* `supabase/migrations/` on purpose: the Supabase CLI globs
that directory, and anything left inside it would be replayed on
`supabase db reset` and re-applied on top of the baseline.

## Why keep them at all

The baseline says what each object is *for*. These say **why it is that way**,
one problem at a time — which is the part you want at 2am when something looks
wrong and you need to know whether it was deliberate.

A few worth knowing about:

| File | What it explains |
|---|---|
| `20260807000001_admin_role_and_rls_hardening.sql` | Why `auth.role() = 'authenticated'` was a vulnerability, and what any signed-up stranger could read before it was fixed |
| `20260807000002_harden_register_rpc.sql` | The `FOR UPDATE` race condition, and why `SET search_path` closes a privilege-escalation hole |
| `20260807000003_event_availability_view.sql` | How a permissions failure disguised itself as "nobody has signed up yet" for weeks, and took the waiting list down with it |
| `20260808000003_expire_abandoned_pending.sql` | Why an abandoned checkout used to hold a seat forever |
| `20260810000001_event_money_guards_and_whatsapp_links.sql` | The first migration here that could fail on *data* rather than schema — it did, against production |
| `20260812000001_drop_stale_waiting_list_policies.sql` | Three RLS policies that existed in production and in no migration, because `drop policy if exists` was given the wrong names and said nothing |
| `20260812000003_revoke_public_execute_on_functions.sql` | Why `revoke ... from anon, authenticated` is not a lock, and how `register_for_event` stayed callable by anyone for a month |

`docs/JOURNEY.md` tells the same story in prose.

## What did not carry forward

Three things ran against production but are deliberately absent from the
baseline:

- **Superseded definitions.** `register_for_event` was rewritten twice and
  `event_availability` once. Only the newest survives.
- **The `admins` grandfather clause** in `20260807000001`, which promoted every
  existing `auth.users` row to administrator. That was a one-time rescue to
  avoid locking anyone out mid-migration; replaying it on a fresh database
  would silently make any account an admin.
- **Operational one-offs** run in the dashboard and never in a migration —
  creating the admin account, ad-hoc `grant` statements later superseded, and
  a scratch `select` against `information_schema`.

## Adding a migration now

Do not add files here. Write a new dated migration in `supabase/migrations/`,
run it locally, then apply it to production. See
[`docs/DATABASE.md`](../../docs/DATABASE.md).
