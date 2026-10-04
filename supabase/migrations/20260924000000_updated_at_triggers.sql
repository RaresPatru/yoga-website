-- ===========================================================================
-- Keep `updated_at` current on every table that has one
-- ===========================================================================
--
-- What this does: before any UPDATE on events, blog_posts, site_content or
-- email_templates, Postgres stamps the row's `updated_at` with the current
-- time. The column then always says when the row last changed, whichever
-- screen, route or SQL editor made the change.
--
-- Why a trigger instead of setting it in the app: of all the admin screens,
-- only the site-content page ever set it. Every other save left the column at
-- its insert time, so the sitemap told search engines that each post and event
-- was last modified on the day it was created. A trigger cannot be forgotten by
-- the next screen someone builds.

-- ---------------------------------------------------------------------------
-- 1. The function the triggers run
-- ---------------------------------------------------------------------------
-- `new` is the row as it is about to be written; the function changes one
-- column on it and hands it back. `search_path` is pinned so that a table or
-- function someone creates later in another schema can never be picked up by
-- name inside it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Only the triggers below run this function, never a person or the API.
-- Revoking EXECUTE keeps it out of the list of functions PostgREST offers to
-- callers (tests/rpc-exposure.spec.ts fails on anything unexpected there).
-- `from public` matters: Postgres grants EXECUTE to PUBLIC when a function is
-- created, and revoking the named roles alone would leave that grant in place.
revoke all on function public.set_updated_at() from public;
revoke all on function public.set_updated_at() from anon, authenticated, service_role;

comment on function public.set_updated_at() is
  'Trigger function: sets updated_at to now() on every UPDATE. Attached to events, blog_posts, site_content and email_templates.';

-- ---------------------------------------------------------------------------
-- 2. The triggers
-- ---------------------------------------------------------------------------
-- BEFORE UPDATE, FOR EACH ROW: runs once per changed row, just before it is
-- written, so the stamp lands in the same write as the change itself.
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

create trigger site_content_set_updated_at
  before update on public.site_content
  for each row execute function public.set_updated_at();

create trigger email_templates_set_updated_at
  before update on public.email_templates
  for each row execute function public.set_updated_at();
