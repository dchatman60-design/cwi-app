-- =====================================================================
-- CWI App — notes on client profiles
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- Job notes and client notes share one table: a note belongs to a job, a
-- client, or both (a note added from a client profile about one of their
-- jobs). Attachments follow the note. Deleting a client deletes the notes
-- that belong only to them; notes on their jobs stay with the jobs.
-- =====================================================================

alter table public.job_notes add column if not exists client_id uuid references public.clients(id) on delete cascade;
alter table public.job_notes alter column job_id drop not null;
alter table public.job_notes drop constraint if exists job_notes_owner_check;
alter table public.job_notes add constraint job_notes_owner_check check (job_id is not null or client_id is not null);
create index if not exists job_notes_client_idx on public.job_notes (client_id, occurred_at desc);

alter table public.job_note_attachments add column if not exists client_id uuid references public.clients(id) on delete cascade;
alter table public.job_note_attachments alter column job_id drop not null;
