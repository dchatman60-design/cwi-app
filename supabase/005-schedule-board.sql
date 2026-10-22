-- =====================================================================
-- CWI App — job pipeline (Kanban board) and schedule (calendar)
-- Run once in Supabase → SQL Editor, after 004. Safe to re-run.
--
-- Replaces the whiteboard: every day's site work, time window and hours
-- on site, plus days off and appointments, live in schedule_entries.
-- Jobs move through the board columns below.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Job pipeline statuses (the board's columns, left to right)
--      need_proposal → proposal_out → ready → scheduled → in_progress
--      → complete        (lost = closed without the work)
--    Existing jobs: draft → need_proposal, active → in_progress.
-- ---------------------------------------------------------------------
alter table public.jobs add column if not exists updated_at timestamptz not null default now();

update public.jobs set status = 'need_proposal' where status is null or status = 'draft';
update public.jobs set status = 'in_progress'   where status = 'active';
alter table public.jobs alter column status set default 'need_proposal';

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.jobs'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.jobs drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.jobs add constraint jobs_status_check check (
  status in ('need_proposal', 'proposal_out', 'ready', 'scheduled', 'in_progress', 'complete', 'lost')
);
create index if not exists jobs_status_idx on public.jobs (status);


-- ---------------------------------------------------------------------
-- 2. Schedule entries — one row per person per day (or per day range)
--    entry_type:  job          site work on a job (time window + hours)
--                 appointment  anything else that blocks time
--                 off          no work / away (can span several days)
-- ---------------------------------------------------------------------
create table if not exists public.schedule_entries (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  entry_type   text not null default 'job',
  entry_date   date not null,
  end_date     date,                       -- last day of a multi-day entry; null = one day
  job_id       uuid references public.jobs(id) on delete cascade,
  title        text,                       -- label for appointments / days off
  assigned_to  uuid references public.app_users(id) on delete set null,
  start_time   time,
  end_time     time,
  hours        numeric(5,2),               -- hours on site (actual once done)
  status       text not null default 'scheduled',
  notes        text,
  created_by   uuid references public.app_users(id) on delete set null,
  constraint schedule_entries_type_check   check (entry_type in ('job', 'appointment', 'off')),
  constraint schedule_entries_status_check check (status in ('scheduled', 'done', 'cancelled')),
  constraint schedule_entries_dates_check  check (end_date is null or end_date >= entry_date),
  constraint schedule_entries_hours_check  check (hours is null or (hours >= 0 and hours <= 24)),
  constraint schedule_entries_job_check    check (entry_type <> 'job' or job_id is not null)
);

create index if not exists schedule_entries_date_idx on public.schedule_entries (entry_date);
create index if not exists schedule_entries_end_idx  on public.schedule_entries (end_date) where end_date is not null;
create index if not exists schedule_entries_job_idx  on public.schedule_entries (job_id);


-- ---------------------------------------------------------------------
-- 3. Access rules — same as the rest of the app: active team members
-- ---------------------------------------------------------------------
alter table public.schedule_entries enable row level security;

drop policy if exists schedule_entries_all on public.schedule_entries;
create policy schedule_entries_all on public.schedule_entries for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());


-- ---------------------------------------------------------------------
-- 4. Quick check: jobs per status
-- ---------------------------------------------------------------------
select status, count(*) from public.jobs group by status order by status;
