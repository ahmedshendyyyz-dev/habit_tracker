-- habit_tracker: notifications. Run after setup.sql, in SQL Editor -> New query -> Run.
-- It is safe to run more than once.
--
--   notify_settings     which reminders you want and when (one row per user)
--   push_subscriptions  the devices that receive notifications (one row per installed app)
--   notify_sent         what was already sent, so nothing is sent twice. Only the notify function uses it.

create table if not exists public.notify_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.notify_settings enable row level security;

drop policy if exists "Read your own notification settings" on public.notify_settings;
create policy "Read your own notification settings" on public.notify_settings
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Add your own notification settings" on public.notify_settings;
create policy "Add your own notification settings" on public.notify_settings
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Change your own notification settings" on public.notify_settings;
create policy "Change your own notification settings" on public.notify_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text not null default '',
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Read your own devices" on public.push_subscriptions;
create policy "Read your own devices" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Add your own devices" on public.push_subscriptions;
create policy "Add your own devices" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Change your own devices" on public.push_subscriptions;
create policy "Change your own devices" on public.push_subscriptions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Remove your own devices" on public.push_subscriptions;
create policy "Remove your own devices" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.notify_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- No policies: only the notify function (with the service key) reads and writes this.
alter table public.notify_sent enable row level security;
