-- habit_tracker: runs the notify function every 5 minutes.
-- Run in SQL Editor after deploying the "notify" function and adding its secrets.
-- Replace YOUR-PROJECT and YOUR-CRON-SECRET first (the secret must match CRON_SECRET in the function's secrets).
-- Your filled-in copy is in data/notifications-cron.sql on your PC (not on GitHub, because it holds the secret).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Remove an older copy of the job, so running this again does not add a second one.
select cron.unschedule(jobid) from cron.job where jobname = 'habit_tracker_notify';

select cron.schedule(
  'habit_tracker_notify',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT.supabase.co/functions/v1/notify',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "YOUR-CRON-SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
