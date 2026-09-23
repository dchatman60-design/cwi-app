-- =====================================================================
-- CWI App — database setup
-- Run once in Supabase → SQL Editor → New query. Safe to re-run.
--
-- 1. Adds the columns and tables the app needs
-- 2. Locks every table down so only signed-in, active team members
--    (rows in app_users with is_active = true) can read or change data
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Schema additions
-- ---------------------------------------------------------------------

-- Jobs link to a client record (the jobs table has no client column yet)
alter table public.jobs add column if not exists client_id uuid references public.clients(id);
alter table public.jobs alter column status set default 'draft';

-- The app uses job statuses draft / active / complete. Remove any older
-- status CHECK constraint (e.g. prospect / quoted / won / lost / on_hold).
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

-- Each measurement records which dimension it is (width, height, rise…) and
-- an optional type / condition note; note-only entries have no number
alter table public.measurements add column if not exists dimension text;
alter table public.measurements add column if not exists note text;
alter table public.measurements alter column value_confirmed drop not null;

-- Quotes / takeoffs (Module 3)
-- Proposal price = material + material × multiplier + labor_days × day_rate
create table if not exists public.quotes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  job_id      uuid references public.jobs(id) on delete set null,
  title       text,
  status      text not null default 'draft',
  multiplier  numeric(4,2) not null default 0.25,
  labor_days  numeric(6,2) not null default 0,
  day_rate    numeric(10,2) not null default 2000,
  notes       text
);

create table if not exists public.quote_items (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  product_id  uuid references public.pemko_products(id) on delete set null,
  sku         text not null,
  description text,
  uom         text,
  unit_price  numeric(10,2) not null default 0,
  quantity    numeric(10,2) not null default 1,
  sort_order  integer not null default 0
);

-- One app user per email (sign-in matches on email, case-insensitive)
create unique index if not exists app_users_email_lower_key on public.app_users (lower(email));

create index if not exists tasks_reminder_due_idx on public.tasks (reminder_scheduled_at) where reminder_sent = false;
create index if not exists tasks_client_idx on public.tasks (client_id);
create index if not exists tasks_job_idx on public.tasks (job_id);
create index if not exists jobs_client_idx on public.jobs (client_id);
create index if not exists measurements_job_idx on public.measurements (job_id);
create index if not exists job_photos_job_idx on public.job_photos (job_id);
create index if not exists quotes_job_idx on public.quotes (job_id);
create index if not exists quote_items_quote_idx on public.quote_items (quote_id);


-- ---------------------------------------------------------------------
-- 2. Team membership helpers
-- ---------------------------------------------------------------------

create or replace function public.is_active_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and is_active
  );
$$;

create or replace function public.is_app_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and is_active and is_admin
  );
$$;

-- Lets the sign-in screen check an email before sending a code.
-- Returns only true/false — never any user details.
create or replace function public.is_team_email(check_email text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where lower(email) = lower(trim(check_email)) and is_active
  );
$$;

grant execute on function public.is_team_email(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Row Level Security
-- Replaces any existing policies on the app's tables.
-- ---------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('app_users','clients','jobs','measurements','job_photos','tasks','quotes','quote_items')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.app_users    enable row level security;
alter table public.clients      enable row level security;
alter table public.jobs         enable row level security;
alter table public.measurements enable row level security;
alter table public.job_photos   enable row level security;
alter table public.tasks        enable row level security;
alter table public.quotes       enable row level security;
alter table public.quote_items  enable row level security;

-- app_users: the team can see each other; you can always see your own row;
-- only admins can add or change users. Nobody deletes — deactivate instead.
create policy app_users_read on public.app_users for select to authenticated
  using (public.is_active_member() or lower(email) = lower(auth.jwt() ->> 'email'));
create policy app_users_admin_insert on public.app_users for insert to authenticated
  with check (public.is_app_admin());
create policy app_users_admin_update on public.app_users for update to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

-- clients, jobs, tasks: team can read, add, and edit. No deletes
-- (tasks keep their full history; clients and jobs are marked inactive/complete).
create policy clients_read   on public.clients for select to authenticated using (public.is_active_member());
create policy clients_insert on public.clients for insert to authenticated with check (public.is_active_member());
create policy clients_update on public.clients for update to authenticated using (public.is_active_member()) with check (public.is_active_member());

create policy jobs_read   on public.jobs for select to authenticated using (public.is_active_member());
create policy jobs_insert on public.jobs for insert to authenticated with check (public.is_active_member());
create policy jobs_update on public.jobs for update to authenticated using (public.is_active_member()) with check (public.is_active_member());

create policy tasks_read   on public.tasks for select to authenticated using (public.is_active_member());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_active_member());
create policy tasks_update on public.tasks for update to authenticated using (public.is_active_member()) with check (public.is_active_member());

-- job_photos: add and view only — photo records are never edited or removed
create policy job_photos_read   on public.job_photos for select to authenticated using (public.is_active_member());
create policy job_photos_insert on public.job_photos for insert to authenticated with check (public.is_active_member());

-- measurements, quotes, quote_items: full access (corrections and line removals)
create policy measurements_all on public.measurements for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
create policy quotes_all on public.quotes for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
create policy quote_items_all on public.quote_items for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

-- pemko_products: the existing policy only allows signed-OUT (anon) reads.
-- Signed-in users need their own read policy.
drop policy if exists pemko_products_team_read on public.pemko_products;
create policy pemko_products_team_read on public.pemko_products for select to authenticated using (true);


-- ---------------------------------------------------------------------
-- 4. Storage — the three private drawing buckets
-- Team members can view and upload. Nobody can overwrite or delete, so
-- Layer 1 measurement photos stay raw and unmodified.
-- ---------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and coalesce(qual, '') || coalesce(with_check, '') ~ '(measurement-photos|annotation-photos|diagrams)'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

drop policy if exists cwi_drawings_read on storage.objects;
drop policy if exists cwi_drawings_upload on storage.objects;

create policy cwi_drawings_read on storage.objects for select to authenticated
  using (bucket_id in ('measurement-photos','annotation-photos','diagrams') and public.is_active_member());
create policy cwi_drawings_upload on storage.objects for insert to authenticated
  with check (bucket_id in ('measurement-photos','annotation-photos','diagrams') and public.is_active_member());


-- ---------------------------------------------------------------------
-- 5. Team members
-- Everyone who signs in must have a row here. Cindy is already added.
-- Uncomment, fill in real emails, and run to add Mike (and yourself).
-- ---------------------------------------------------------------------

-- insert into public.app_users (full_name, role, email, is_admin, is_active) values
--   ('Mike Siebuhr', 'Owner', 'mike@REPLACE.com', true, true);
