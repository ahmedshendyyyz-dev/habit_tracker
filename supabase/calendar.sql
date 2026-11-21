-- habit_tracker: the private link for your calendar feed. Run in SQL Editor -> New query -> Run.
-- It is safe to run more than once. Then deploy the "calendar" function (see its file).
--
--   calendar_feeds  one secret token per user. The calendar function finds you by it.
--                   Turning the link off in the app deletes the row, and the old link stops working.

create table if not exists public.calendar_feeds (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;

drop policy if exists "Read your own calendar link" on public.calendar_feeds;
create policy "Read your own calendar link" on public.calendar_feeds
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Add your own calendar link" on public.calendar_feeds;
create policy "Add your own calendar link" on public.calendar_feeds
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Change your own calendar link" on public.calendar_feeds;
create policy "Change your own calendar link" on public.calendar_feeds
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Remove your own calendar link" on public.calendar_feeds;
create policy "Remove your own calendar link" on public.calendar_feeds
  for delete to authenticated using (user_id = (select auth.uid()));
