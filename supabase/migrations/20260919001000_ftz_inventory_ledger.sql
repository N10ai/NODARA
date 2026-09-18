create table if not exists public.ftz_inventory_ledger(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,inventory_identity_id uuid not null references public.ftz_inventory_identities(id),
 admission_id uuid references public.ftz_admissions(id),cargo_object_id uuid references public.cargo_objects(id),event_type text not null,
 quantity_delta numeric not null default 0,uom text not null,reference_type text,reference_id uuid,reference_number text,
 reason text,metadata jsonb not null default '{}'::jsonb,occurred_at timestamptz not null default now(),created_at timestamptz not null default now(),created_by uuid default auth.uid());
create index if not exists ftz_inventory_ledger_identity_idx on public.ftz_inventory_ledger(inventory_identity_id,occurred_at,id);
create index if not exists ftz_inventory_ledger_admission_idx on public.ftz_inventory_ledger(admission_id);
alter table public.ftz_inventory_ledger enable row level security;
drop policy if exists ftz_inventory_ledger_member on public.ftz_inventory_ledger;
create policy ftz_inventory_ledger_member on public.ftz_inventory_ledger for select to authenticated using(nodara_is_org_member(organization_id));

create or replace view public.ftz_inventory_balance as
select l.organization_id,l.inventory_identity_id,i.identity_type,i.identity_number,i.status identity_status,l.cargo_object_id,c.description,c.package_type,c.uom,
sum(l.quantity_delta) quantity_on_hand,min(l.occurred_at) first_posted_at,max(l.occurred_at) last_activity_at
from ftz_inventory_ledger l join ftz_inventory_identities i on i.id=l.inventory_identity_id left join cargo_objects c on c.id=l.cargo_object_id
group by l.organization_id,l.inventory_identity_id,i.identity_type,i.identity_number,i.status,l.cargo_object_id,c.description,c.package_type,c.uom;

create or replace function public.nodara_post_ftz_admission_inventory(p_admission_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_identity uuid;v_open int;v_count int:=0;
begin
 select organization_id into v_org from ftz_admissions where id=p_admission_id for update;
 if v_org is null then raise exception 'FTZ admission not found';end if;
 if not nodara_is_org_member(v_org) then raise exception 'Workspace access denied';end if;
 select count(*) into v_open from ftz_admission_reconciliation where admission_id=p_admission_id and resolution_status='OPEN';
 if v_open>0 then raise exception 'Resolve all receiving variances before posting FTZ inventory';end if;
 if not exists(select 1 from ftz_admission_reconciliation where admission_id=p_admission_id) then raise exception 'Run receiving reconciliation before posting inventory';end if;
 select id into v_identity from ftz_inventory_identities where admission_id=p_admission_id order by created_at limit 1;
 if v_identity is null then raise exception 'Admission has no inventory identity';end if;
 if exists(select 1 from ftz_inventory_ledger where admission_id=p_admission_id and event_type='ADMISSION_POST') then raise exception 'Admission inventory is already posted';end if;
 insert into ftz_inventory_identity_cargo(organization_id,inventory_identity_id,cargo_object_id)
 select distinct v_org,v_identity,r.cargo_object_id from ftz_admission_reconciliation r where r.admission_id=p_admission_id and r.cargo_object_id is not null and r.resolution_status<>'OPEN'
 on conflict(inventory_identity_id,cargo_object_id) do nothing;
 insert into ftz_inventory_ledger(organization_id,inventory_identity_id,admission_id,cargo_object_id,event_type,quantity_delta,uom,reference_type,reference_id,reference_number,metadata)
 select v_org,v_identity,p_admission_id,r.cargo_object_id,'ADMISSION_POST',r.received_quantity,r.quantity_uom,'ADMISSION',p_admission_id,a.admission_number,
 jsonb_build_object('reconciliation_id',r.id,'expected_quantity',r.expected_quantity,'variance_quantity',r.variance_quantity)
 from ftz_admission_reconciliation r join ftz_admissions a on a.id=p_admission_id
 where r.admission_id=p_admission_id and r.cargo_object_id is not null and r.resolution_status<>'OPEN' and coalesce(r.received_quantity,0)>0;
 get diagnostics v_count=row_count;
 update ftz_admissions set admission_status='CLOSED',closed_at=now(),updated_at=now(),updated_by=auth.uid() where id=p_admission_id;
 update ftz_inventory_identities set status='ACTIVE',closed_at=null where id=v_identity;
 perform nodara_ftz_record_event(p_admission_id,'INVENTORY_POSTED','FTZ inventory posted',v_count||' inventory line(s) posted','INVENTORY_IDENTITY',v_identity,jsonb_build_object('ledger_lines',v_count));
 return v_count;
end $$;

create or replace function public.nodara_ftz_inventory_adjust(p_inventory_identity_id uuid,p_cargo_object_id uuid,p_quantity_delta numeric,p_uom text,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_adm uuid;v_id uuid;v_balance numeric;
begin
 select organization_id,admission_id into v_org,v_adm from ftz_inventory_identities where id=p_inventory_identity_id and status='ACTIVE';
 if v_org is null or not nodara_is_org_member(v_org) then raise exception 'Active inventory identity not found or access denied';end if;
 if p_quantity_delta=0 then raise exception 'Adjustment quantity cannot be zero';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Adjustment reason is required';end if;
 select coalesce(sum(quantity_delta),0) into v_balance from ftz_inventory_ledger where inventory_identity_id=p_inventory_identity_id and cargo_object_id=p_cargo_object_id and upper(uom)=upper(p_uom);
 if v_balance+p_quantity_delta<0 then raise exception 'Adjustment would create negative FTZ inventory';end if;
 insert into ftz_inventory_ledger(organization_id,inventory_identity_id,admission_id,cargo_object_id,event_type,quantity_delta,uom,reference_type,reason)
 values(v_org,p_inventory_identity_id,v_adm,p_cargo_object_id,'ADJUSTMENT',p_quantity_delta,upper(p_uom),'ADJUSTMENT',btrim(p_reason)) returning id into v_id;
 perform nodara_ftz_record_event(v_adm,'INVENTORY_ADJUSTED','Inventory adjusted',p_quantity_delta||' '||upper(p_uom)||' · '||btrim(p_reason),'INVENTORY_LEDGER',v_id,'{}'::jsonb);
 return v_id;
end $$;
revoke execute on function public.nodara_ftz_inventory_adjust(uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.nodara_ftz_inventory_adjust(uuid,uuid,numeric,text,text) to authenticated;