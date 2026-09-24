-- =====================================================================
-- CWI App — openings, job notes & files, labor/service quote lines, deletes
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Openings: each door or window on a job
--    (If an openings table already exists, it's kept — run 004 afterwards.)
-- ---------------------------------------------------------------------
create table if not exists public.openings (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  job_id         uuid not null references public.jobs(id) on delete cascade,
  opening_name   text not null,                         -- "Front entry", "Suite 101", "Door 3"
  opening_type   text not null default 'single_door',   -- single_door | double_door | window | other
  is_fire_rated  boolean not null default false,        -- queues FTP-001 testing
  is_complex     boolean not null default false,        -- "Complex" — office to assess
  status         text,
  notes          text
);
create index if not exists openings_job_idx on public.openings (job_id);

-- Measurements, photos and quote lines belong to an opening
alter table public.measurements add column if not exists opening_id uuid references public.openings(id) on delete cascade;
alter table public.job_photos   add column if not exists opening_id uuid references public.openings(id) on delete set null;
alter table public.quote_items  add column if not exists opening_id uuid references public.openings(id) on delete set null;
create index if not exists measurements_opening_idx on public.measurements (opening_id);
create index if not exists job_photos_opening_idx on public.job_photos (opening_id);
create index if not exists quote_items_opening_idx on public.quote_items (opening_id);


-- ---------------------------------------------------------------------
-- 2. Quote lines: Pemko products (marked up) or labor / service work
--    (install customer-supplied material, refurbish …) priced directly
-- ---------------------------------------------------------------------
alter table public.quote_items add column if not exists item_type text not null default 'product';
alter table public.quote_items alter column sku drop not null;


-- ---------------------------------------------------------------------
-- 3. Job notes with attached files (emails, screenshots, text threads)
-- ---------------------------------------------------------------------
create table if not exists public.job_notes (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  category     text not null default 'general',  -- client_correspondence | general | site_visit | supplier | scheduling
  channel      text,                             -- Text message | Email | Phone call | In person
  occurred_at  timestamptz not null default now(),
  body         text,
  author_id    uuid references public.app_users(id) on delete set null
);
create index if not exists job_notes_job_idx on public.job_notes (job_id, occurred_at desc);

create table if not exists public.job_note_attachments (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  note_id       uuid not null references public.job_notes(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  storage_path  text not null,
  file_name     text,
  content_type  text,
  size_bytes    bigint
);
create index if not exists job_note_attachments_note_idx on public.job_note_attachments (note_id);

-- Private bucket for note attachments (25 MB per file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('job-files', 'job-files', false, 26214400)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 4. What happens on delete
--    Deleting a job removes its measurements and photo records (and,
--    via the tables above, its openings and notes). Tasks are kept but
--    unlinked. Deleting a client unlinks its jobs and tasks.
-- ---------------------------------------------------------------------
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
        (rel.relname in ('measurements', 'job_photos', 'tasks') and ref.relname = 'jobs')
        or (rel.relname in ('jobs', 'tasks') and ref.relname = 'clients')
      )
  loop
    execute format('alter table public.%I drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.measurements add constraint measurements_job_id_fkey foreign key (job_id) references public.jobs(id) on delete cascade;
alter table public.job_photos   add constraint job_photos_job_id_fkey   foreign key (job_id) references public.jobs(id) on delete cascade;
alter table public.tasks        add constraint tasks_job_id_fkey        foreign key (job_id) references public.jobs(id) on delete set null;
alter table public.tasks        add constraint tasks_client_id_fkey     foreign key (client_id) references public.clients(id) on delete set null;
alter table public.jobs         add constraint jobs_client_id_fkey      foreign key (client_id) references public.clients(id) on delete set null;


-- ---------------------------------------------------------------------
-- 5. Access rules
-- ---------------------------------------------------------------------
alter table public.openings             enable row level security;
alter table public.job_notes            enable row level security;
alter table public.job_note_attachments enable row level security;

drop policy if exists openings_all on public.openings;
create policy openings_all on public.openings for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists job_notes_all on public.job_notes;
create policy job_notes_all on public.job_notes for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists job_note_attachments_all on public.job_note_attachments;
create policy job_note_attachments_all on public.job_note_attachments for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

-- Jobs and clients: admins only can delete (a job delete removes everything in it)
drop policy if exists jobs_delete on public.jobs;
create policy jobs_delete on public.jobs for delete to authenticated using (public.is_app_admin());
drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for delete to authenticated using (public.is_app_admin());

-- Photos: link to an opening; delete annotations/diagrams; raw measurement photos admins only
drop policy if exists job_photos_update on public.job_photos;
create policy job_photos_update on public.job_photos for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
drop policy if exists job_photos_delete on public.job_photos;
create policy job_photos_delete on public.job_photos for delete to authenticated
  using (public.is_active_member() and (layer <> 1 or public.is_app_admin()));

-- Storage
drop policy if exists cwi_job_files_read on storage.objects;
drop policy if exists cwi_job_files_upload on storage.objects;
drop policy if exists cwi_job_files_delete on storage.objects;
drop policy if exists cwi_markups_delete on storage.objects;
drop policy if exists cwi_raw_photos_delete on storage.objects;

create policy cwi_job_files_read on storage.objects for select to authenticated
  using (bucket_id = 'job-files' and public.is_active_member());
create policy cwi_job_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'job-files' and public.is_active_member());
create policy cwi_job_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'job-files' and public.is_active_member());
create policy cwi_markups_delete on storage.objects for delete to authenticated
  using (bucket_id in ('annotation-photos', 'diagrams') and public.is_active_member());
create policy cwi_raw_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'measurement-photos' and public.is_app_admin());
