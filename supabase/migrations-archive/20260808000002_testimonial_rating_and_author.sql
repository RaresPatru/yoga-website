-- ============================================================================
-- Testimonials: real ratings, real names, working video
-- ============================================================================
--
-- THE PROBLEM
--
-- Both the home page and the testimonials page drew five filled stars above
-- every quote. There is no rating column in this schema and never was — the
-- markup was literally `[...Array(5)].map(...)`, a hardcoded five stars on
-- every testimonial regardless of what anyone said.
--
-- That is fabricated social proof. It is also the kind of thing that quietly
-- undermines the real testimonials around it: a visitor who notices that every
-- single review is a perfect five has less reason to believe any of them.
--
-- Separately, the table has always had `type in ('text','video')`, but the
-- pages rendered `content` as a paragraph either way — so a video testimonial
-- displayed as a URL in quotation marks. Video testimonials are consistently
-- reported as the highest-converting form of social proof for retreats and
-- workshops, and the feature was half-built.
--
-- THE FIX
--
--   rating       optional, 1-5, NULL when nobody gave one. Stars are drawn only
--                where a real number exists.
--   author_name  who said it. An attributed quote carries weight; an anonymous
--                one reads as invented.
--   video_url    where the recording lives, so `type = 'video'` can render as
--                an actual player.
-- ============================================================================

alter table public.testimonials
  add column if not exists rating      smallint,
  add column if not exists author_name text,
  add column if not exists video_url   text;

-- Deliberately nullable with no default. A default of 5 would recreate exactly
-- the problem this migration removes; NULL honestly means "not rated".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'testimonials_rating_range'
  ) then
    alter table public.testimonials
      add constraint testimonials_rating_range
      check (rating is null or (rating >= 1 and rating <= 5));
  end if;
end $$;

comment on column public.testimonials.rating is
  'Optional 1-5 rating. NULL means unrated — render no stars rather than assuming five.';
comment on column public.testimonials.author_name is
  'Who gave the testimonial. Optional; falls back to an anonymous label.';
comment on column public.testimonials.video_url is
  'Video file or embed URL, used when type = ''video''.';
