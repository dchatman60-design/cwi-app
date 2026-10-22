-- =====================================================================
-- CWI App — job photos & videos (straight from the phone's camera roll)
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- A fourth, separate photo set: everyday site photos and videos. They are
-- NOT measurement photos (Layer 1), annotations (Layer 2) or diagrams
-- (Layer 3), so they live in their own table and bucket.
-- =====================================================================

-- Private bucket. No per-bucket size cap: the project's global upload limit
-- applies (Supabase Free = 50 MB per file; raise it on a paid plan under
-- Storage → Settings, then set VITE_MAX_UPLOAD_MB in Vercel to match).
insert into storage.buckets (id, name, public)
values ('job-media', 'job-media', false)
on conflict (id) do nothing;

create table if not exists public.job_media (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  job_id        uuid not null references public.jobs(id) on delete cascade,
  opening_id    uuid references public.openings(id) on delete set null,
  media_type    text not null default 'photo',   -- photo | video
  storage_path  text not null,
  file_name     text,
  content_type  text,
  size_bytes    bigint,
  caption       text,
  uploaded_by   uuid references public.app_users(id) on delete set null,
  constraint job_media_type_check check (media_type in ('photo', 'video'))
);
create index if not exists job_media_job_idx on public.job_media (job_id, created_at desc);
create index if not exists job_media_opening_idx on public.job_media (opening_id);

alter table public.job_media enable row level security;
drop policy if exists job_media_all on public.job_media;
create policy job_media_all on public.job_media for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists cwi_job_media_read on storage.objects;
drop policy if exists cwi_job_media_upload on storage.objects;
drop policy if exists cwi_job_media_delete on storage.objects;
create policy cwi_job_media_read on storage.objects for select to authenticated
  using (bucket_id = 'job-media' and public.is_active_member());
create policy cwi_job_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'job-media' and public.is_active_member());
create policy cwi_job_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'job-media' and public.is_active_member());
