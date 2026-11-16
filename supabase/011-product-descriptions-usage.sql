-- 011: editable Pemko descriptions + "most used" parts
-- Run once in the Supabase SQL editor. Safe to re-run.

-- Keep the catalog's original text the first time someone edits a description,
-- and record who changed it and when.
alter table public.pemko_products add column if not exists original_description text;
alter table public.pemko_products add column if not exists description_updated_at timestamptz;
alter table public.pemko_products add column if not exists description_updated_by uuid;

-- Team members can update descriptions and notes (reads were already allowed).
drop policy if exists pemko_products_team_update on public.pemko_products;
create policy pemko_products_team_update on public.pemko_products for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

-- Only the description and notes columns may change from the app.
revoke update on public.pemko_products from authenticated;
grant update (description, notes, original_description, description_updated_at, description_updated_by)
  on public.pemko_products to authenticated;

-- How often each catalog part has been put on a quote.
create or replace view public.product_usage with (security_invoker = true) as
select
  qi.product_id,
  count(*)::int as line_count,
  count(distinct qi.quote_id)::int as quote_count,
  max(qi.created_at) as last_used
from public.quote_items qi
where qi.product_id is not null
group by qi.product_id;

grant select on public.product_usage to authenticated;
