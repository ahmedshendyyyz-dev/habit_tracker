-- habit_tracker: database setup for Supabase.
-- Paste all of this into Supabase: SQL Editor -> New query -> Run. It is safe to run more than once.
--
-- What it creates:
--   life_data          one private document per user (all your entries), with a revision number
--   life_data_backups  a copy of your data from the start of each day (kept 90 days), and one before every restore
--   save_life_data     saves only if nobody saved in between, so two devices never overwrite each other
--   restore_life_data  replaces your data with a backup, saving what you had first
--   photos bucket      private storage; each user can only see their own folder

-- ---------- Your data ----------

create table if not exists public.life_data (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  rev integer not null default 0,
  data jsonb not null default '{"version": 1, "items": {}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.life_data enable row level security;

drop policy if exists "Read your own data" on public.life_data;
create policy "Read your own data" on public.life_data
  for select to authenticated
  using (user_id = (select auth.uid()));
-- There are no insert or update policies on purpose: all writes go through the two functions below.

-- ---------- Backups ----------

create table if not exists public.life_data_backups (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'daily' check (kind in ('daily', 'before-restore')),
  rev integer not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists life_data_backups_user_created on public.life_data_backups (user_id, created_at desc);

alter table public.life_data_backups enable row level security;

drop policy if exists "Read your own backups" on public.life_data_backups;
create policy "Read your own backups" on public.life_data_backups
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------- Saving ----------

-- Saves new_data if the stored revision is still expected_rev, and returns the new revision.
-- If another device saved first, it fails with "conflict" and the app reloads and tries again.
create or replace function public.save_life_data(expected_rev integer, new_data jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  stored public.life_data%rowtype;
  next_rev integer;
  -- "Today" in Egypt time, so the daily backup starts at your midnight.
  today_start timestamptz := (date_trunc('day', now() at time zone 'Africa/Cairo')) at time zone 'Africa/Cairo';
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if jsonb_typeof(new_data -> 'items') is distinct from 'object' then
    raise exception 'Invalid data' using errcode = '22023';
  end if;

  select * into stored from public.life_data where user_id = me for update;

  if not found then
    if expected_rev <> 0 then
      raise exception 'conflict' using errcode = '40001';
    end if;
    insert into public.life_data (user_id, rev, data) values (me, 1, new_data);
    return 1;
  end if;

  if stored.rev <> expected_rev then
    raise exception 'conflict' using errcode = '40001';
  end if;

  -- The first save of the day keeps a copy of the data as it was, and old daily copies past 90 are removed.
  if not exists (
    select 1 from public.life_data_backups b
    where b.user_id = me and b.kind = 'daily' and b.created_at >= today_start
  ) then
    insert into public.life_data_backups (user_id, kind, rev, data) values (me, 'daily', stored.rev, stored.data);
    delete from public.life_data_backups
    where id in (
      select id from public.life_data_backups
      where user_id = me and kind = 'daily'
      order by created_at desc
      offset 90
    );
  end if;

  next_rev := stored.rev + 1;
  update public.life_data set rev = next_rev, data = new_data, updated_at = now() where user_id = me;
  return next_rev;
end;
$$;

-- Replaces your data with new_data (a backup, or a file you exported), keeping what you had as a backup first.
create or replace function public.restore_life_data(new_data jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  stored public.life_data%rowtype;
  next_rev integer;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if jsonb_typeof(new_data -> 'items') is distinct from 'object' then
    raise exception 'That is not a habit_tracker backup.' using errcode = '22023';
  end if;

  select * into stored from public.life_data where user_id = me for update;

  if found then
    insert into public.life_data_backups (user_id, kind, rev, data) values (me, 'before-restore', stored.rev, stored.data);
    next_rev := stored.rev + 1;
    update public.life_data set rev = next_rev, data = new_data, updated_at = now() where user_id = me;
  else
    next_rev := 1;
    insert into public.life_data (user_id, rev, data) values (me, 1, new_data);
  end if;
  return next_rev;
end;
$$;

revoke all on function public.save_life_data(integer, jsonb) from public, anon;
revoke all on function public.restore_life_data(jsonb) from public, anon;
grant execute on function public.save_life_data(integer, jsonb) to authenticated;
grant execute on function public.restore_life_data(jsonb) to authenticated;

-- ---------- Photos ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Each user's photos live in a folder named after their user id, and only they can use it.
drop policy if exists "Read your own photos" on storage.objects;
create policy "Read your own photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Upload your own photos" on storage.objects;
create policy "Upload your own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Delete your own photos" on storage.objects;
create policy "Delete your own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
