-- =====================================================================
-- CWI App — "Not accepted / Declined" job status
-- Run once in Supabase → SQL Editor, after 005. Safe to re-run.
--
-- declined = we turned the job down (lost = the client said no).
-- Marking a job Declined in the app also creates a "Decline Call — Inform
-- Client" task; that part lives in the app, so nothing else is needed here.
-- =====================================================================

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (
  status in ('need_proposal', 'proposal_out', 'ready', 'scheduled', 'in_progress', 'complete', 'lost', 'declined')
);
