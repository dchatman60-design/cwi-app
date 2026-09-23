-- =====================================================================
-- CWI App — run the reminder email job every 5 minutes
-- Run in Supabase → SQL Editor AFTER the app is deployed with CRON_SECRET set.
--
-- Vercel's Hobby plan only allows once-a-day cron jobs, so Supabase's
-- scheduler (pg_cron) calls the endpoint instead.
--
-- Before running: replace PASTE_CRON_SECRET_HERE with the exact value of
-- CRON_SECRET in Vercel. Don't commit the real secret to git.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running replaces the existing job with the same name
select cron.schedule(
  'cwi-send-reminders',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://cwi-app-three.vercel.app/api/send-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer PASTE_CRON_SECRET_HERE'),
    timeout_milliseconds := 30000
  );
  $$
);

-- Check it's scheduled:
--   select jobname, schedule, active from cron.job;
-- See recent runs (status 200 = OK):
--   select status_code, content, created from net._http_response order by created desc limit 10;
-- Stop it:
--   select cron.unschedule('cwi-send-reminders');
