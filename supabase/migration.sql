-- Yoga Website Database Schema
-- Run this in Supabase SQL Editor

-- 1. Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. Events
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title_ro text not null,
  title_en text,
  description_ro text,
  description_en text,
  date date not null,
  time time not null,
  location text,
  price integer not null default 0,
  max_participants integer,
  image_url text,
  whatsapp_group_link text,
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.events enable row level security;

create policy "Anyone can view published events"
  on public.events for select
  using (published = true);

create policy "Admins can manage events"
  on public.events for all
  using (auth.role() = 'authenticated');

-- 3. Registrations
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text not null,
  payment_status text default 'free' check (payment_status in ('free', 'pending', 'completed', 'refunded')),
  stripe_session_id text,
  created_at timestamptz default now()
);

alter table public.registrations enable row level security;

create policy "Admins can view registrations"
  on public.registrations for select
  using (auth.role() = 'authenticated');

create policy "Anyone can insert registrations"
  on public.registrations for insert
  with check (true);

-- 4. Blog Posts
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title_ro text not null,
  title_en text,
  content_ro text,
  content_en text,
  media_urls jsonb default '[]'::jsonb,
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.blog_posts enable row level security;

create policy "Anyone can view published posts"
  on public.blog_posts for select
  using (published = true);

create policy "Admins can manage posts"
  on public.blog_posts for all
  using (auth.role() = 'authenticated');

-- 5. Testimonials
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade not null,
  type text not null check (type in ('text', 'video')),
  content text not null,
  approved boolean default false,
  created_at timestamptz default now()
);

alter table public.testimonials enable row level security;

create policy "Anyone can view approved testimonials"
  on public.testimonials for select
  using (approved = true);

create policy "Authenticated users can insert"
  on public.testimonials for insert
  with check (auth.role() = 'authenticated');

create policy "Admins can manage testimonials"
  on public.testimonials for all
  using (auth.role() = 'authenticated');

-- 6. Contact Messages
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  created_at timestamptz default now()
);

alter table public.contact_messages enable row level security;

create policy "Anyone can insert contact messages"
  on public.contact_messages for insert
  with check (true);

create policy "Admins can view contact messages"
  on public.contact_messages for select
  using (auth.role() = 'authenticated');

-- 7. Email Templates
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  type text unique not null check (type in ('registration_confirmation', 'payment_confirmation', 'testimonial_request')),
  subject_ro text not null,
  subject_en text,
  body_ro text not null,
  body_en text,
  updated_at timestamptz default now()
);

alter table public.email_templates enable row level security;

create policy "Admins can manage email templates"
  on public.email_templates for all
  using (auth.role() = 'authenticated');

-- Insert default email templates
insert into public.email_templates (type, subject_ro, body_ro, subject_en, body_en) values
('registration_confirmation',
 'Confirmare înscriere - {{event_name}}',
 '<h2>Salut {{user_name}}!</h2><p>Te-ai înscris cu succes la <strong>{{event_name}}</strong>.</p><p><strong>Data:</strong> {{event_date}}<br><strong>Ora:</strong> {{event_time}}<br><strong>Locație:</strong> {{event_location}}</p><p>Alătură-te grupului de WhatsApp: <a href="{{whatsapp_link}}">{{whatsapp_link}}</a></p><p>În fișierul atașat găsești invitația în calendar.</p>',
 'Registration confirmation - {{event_name}}',
 '<h2>Hi {{user_name}}!</h2><p>You have successfully registered for <strong>{{event_name}}</strong>.</p><p><strong>Date:</strong> {{event_date}}<br><strong>Time:</strong> {{event_time}}<br><strong>Location:</strong> {{event_location}}</p><p>Join the WhatsApp group: <a href="{{whatsapp_link}}">{{whatsapp_link}}</a></p><p>Find the calendar invitation attached.</p>'),
('payment_confirmation',
 'Confirmare plată - {{event_name}}',
 '<h2>Salut {{user_name}}!</h2><p>Plata pentru <strong>{{event_name}}</strong> a fost confirmată.</p><p>În fișierul atașat găsești invitația în calendar și linkul către grupul de WhatsApp.</p>',
 'Payment confirmation - {{event_name}}',
 '<h2>Hi {{user_name}}!</h2><p>Your payment for <strong>{{event_name}}</strong> has been confirmed.</p><p>Find the calendar invitation and WhatsApp group link attached.</p>'),
('testimonial_request',
 'Părerea ta contează - {{event_name}}',
 '<h2>Salut {{user_name}}!</h2><p>Ne-ar face plăcere să aflăm părerea ta despre <strong>{{event_name}}</strong>.</p><p>Lasă un testimonial aici: <a href="{{testimonial_link}}">{{testimonial_link}}</a></p>',
 'Your opinion matters - {{event_name}}',
 '<h2>Hi {{user_name}}!</h2><p>We would love to hear your feedback about <strong>{{event_name}}</strong>.</p><p>Leave a testimonial here: <a href="{{testimonial_link}}">{{testimonial_link}}</a></p>')
on conflict (type) do nothing;

-- Create storage bucket for media
insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do nothing;

-- Indexes for performance
create index if not exists idx_events_published_date on public.events(published, date);
create index if not exists idx_registrations_event on public.registrations(event_id);
create index if not exists idx_blog_posts_published on public.blog_posts(published);
create index if not exists idx_testimonials_approved on public.testimonials(approved);
create index if not exists idx_testimonials_event on public.testimonials(event_id);
