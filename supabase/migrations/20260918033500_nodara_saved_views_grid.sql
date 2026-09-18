create table if not exists public.nodara_saved_views(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, user_id uuid not null default auth.uid(),
 resource_type text not null, name text not null, is_default boolean not null default false, is_shared boolean not null default false,
 columns jsonb not null default '[]'::jsonb, filters jsonb not null default '[]'::jsonb, sort jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,user_id,resource_type,name)
);
alter table public.nodara_saved_views enable row level security;
drop policy if exists nodara_saved_views_read on public.nodara_saved_views;
drop policy if exists nodara_saved_views_write on public.nodara_saved_views;
create policy nodara_saved_views_read on public.nodara_saved_views for select to authenticated using(nodara_is_org_member(organization_id) and (user_id=auth.uid() or is_shared));
create policy nodara_saved_views_write on public.nodara_saved_views for all to authenticated using(nodara_is_org_member(organization_id) and user_id=auth.uid()) with check(nodara_is_org_member(organization_id) and user_id=auth.uid());

create or replace view public.ftz_admission_grid as
select a.*,
 coalesce(ec.expected_quantity,0) expected_quantity, ec.expected_uom,
 coalesce(rc.received_quantity,0) received_quantity, rc.received_uom,
 coalesce(rc.received_quantity,0)-coalesce(ec.expected_quantity,0) variance_quantity,
 wr.wr_numbers,
 coalesce(wr.linked_receipts,0) linked_wr_count
from public.ftz_admission_workspace a
left join lateral(select sum(quantity) expected_quantity,case when count(distinct uom)=1 then min(uom) else 'MIXED' end expected_uom from public.ftz_expected_cargo e where e.admission_id=a.id) ec on true
left join lateral(select sum(received_quantity) received_quantity,case when count(distinct quantity_uom)=1 then min(quantity_uom) else 'MIXED' end received_uom from public.ftz_admission_reconciliation r where r.admission_id=a.id) rc on true
left join lateral(select count(*) linked_receipts,string_agg(receipt_number,', ' order by receipt_number) wr_numbers from public.ftz_admission_receipt_workspace w where w.admission_id=a.id) wr on true;