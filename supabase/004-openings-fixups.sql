-- =====================================================================
-- CWI App — align the existing openings table with the app
-- Run once in Supabase → SQL Editor, after 003. Safe to re-run.
--
-- An openings table already existed (from the earlier CRM/CV table setup),
-- so 003 kept it as is. The app uses its columns: opening_name,
-- opening_type, is_fire_rated, is_complex, status, notes.
-- =====================================================================

-- 1. The app only fills the columns it uses; nothing else may be required
do $$
declare c record;
begin
  for c in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'openings'
      and is_nullable = 'NO' and column_default is null
      and column_name not in ('id', 'job_id', 'opening_name')
  loop
    execute format('alter table public.openings alter column %I drop not null', c.column_name);
  end loop;
end $$;

-- 2. Allow the app's opening types: single_door, double_door, window, other
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.openings'::regclass and contype = 'c'
  loop
    execute format('alter table public.openings drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.openings alter column opening_type set default 'single_door';
alter table public.openings alter column is_fire_rated set default false;
alter table public.openings alter column is_complex set default false;

-- 3. On delete: a job takes its openings with it; an opening takes its
--    measurements; its photos and quote lines are kept (unlinked)
do $$
declare c record;
begin
  for c in
    select rel.relname as tbl, con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_class ref on ref.oid = con.confrelid
    where con.contype = 'f'
      and rel.relnamespace = 'public'::regnamespace
      and (
        (rel.relname = 'openings' and ref.relname = 'jobs')
        or (rel.relname in ('measurements', 'job_photos', 'quote_items') and ref.relname = 'openings')
      )
  loop
    execute format('alter table public.%I drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.openings     add constraint openings_job_id_fkey         foreign key (job_id)     references public.jobs(id)     on delete cascade;
alter table public.measurements add constraint measurements_opening_id_fkey foreign key (opening_id) references public.openings(id) on delete cascade;
alter table public.job_photos   add constraint job_photos_opening_id_fkey   foreign key (opening_id) references public.openings(id) on delete set null;
alter table public.quote_items  add constraint quote_items_opening_id_fkey  foreign key (opening_id) references public.openings(id) on delete set null;

-- 4. Quick check: the openings table's columns
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'openings'
order by ordinal_position;
