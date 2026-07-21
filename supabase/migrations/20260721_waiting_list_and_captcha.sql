-- Create waiting_list table
create table if not exists waiting_list (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_registration_id uuid references registrations(id) on delete set null
);

-- Create waiting_list_notifications table
create table if not exists waiting_list_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  batch_number integer not null,
  notified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  spots_opened integer not null default 1,
  claimed_count integer not null default 0
);

-- Enable RLS
alter table waiting_list enable row level security;
alter table waiting_list_notifications enable row level security;

-- RLS: everyone can insert into waiting_list (public)
create policy "Anyone can join waiting list"
  on waiting_list for insert
  with check (true);

-- RLS: authenticated users can view waiting list entries
create policy "Authenticated users can view waiting list"
  on waiting_list for select
  using (auth.role() = 'authenticated');

-- RLS: authenticated users can update waiting list (for claiming)
create policy "Authenticated users can update waiting list"
  on waiting_list for update
  using (auth.role() = 'authenticated');

-- RLS: authenticated users can view notification records
create policy "Authenticated users can view waiting list notifications"
  on waiting_list_notifications for select
  using (auth.role() = 'authenticated');

-- RLS: authenticated users can insert notifications
create policy "Authenticated users can insert notifications"
  on waiting_list_notifications for insert
  with check (auth.role() = 'authenticated');

-- Add index for faster lookups
create index if not exists idx_waiting_list_event_id on waiting_list(event_id);
create index if not exists idx_waiting_list_claimed_at on waiting_list(claimed_at);
create index if not exists idx_waiting_list_notifications_event_id on waiting_list_notifications(event_id);
