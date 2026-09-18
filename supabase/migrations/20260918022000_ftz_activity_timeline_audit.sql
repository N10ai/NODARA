-- FTZ chronological activity, evidence timeline and immutable audit trail.
create table if not exists public.ftz_activity_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 admission_id uuid not null references public.ftz_admissions(id) on delete cascade,
 event_at timestamptz not null default now(), event_type text not null, title text not null, detail text,
 actor_id uuid default auth.uid(), source_type text, source_id uuid, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists idx_ftz_activity_timeline on public.ftz_activity_events(admission_id,event_at desc);
alter table public.ftz_activity_events enable row level security;
drop policy if exists ftz_activity_org_access on public.ftz_activity_events;
create policy ftz_activity_org_access on public.ftz_activity_events for select to authenticated using(public.nodara_is_org_member(organization_id));

create table if not exists public.ftz_audit_log (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 admission_id uuid references public.ftz_admissions(id) on delete cascade, occurred_at timestamptz not null default now(),
 actor_id uuid default auth.uid(), action text not null, record_type text not null, record_id uuid,
 before_data jsonb, after_data jsonb, reason text, metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_ftz_audit_admission on public.ftz_audit_log(admission_id,occurred_at desc);
alter table public.ftz_audit_log enable row level security;
drop policy if exists ftz_audit_org_access on public.ftz_audit_log;
create policy ftz_audit_org_access on public.ftz_audit_log for select to authenticated using(public.nodara_is_org_member(organization_id));

create or replace function public.nodara_ftz_record_event(p_admission_id uuid,p_event_type text,p_title text,p_detail text default null,p_source_type text default null,p_source_id uuid default null,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_id uuid;
begin select organization_id into v_org from public.ftz_admissions where id=p_admission_id;
 if v_org is null or not public.nodara_is_org_member(v_org) then raise exception 'Workspace access denied'; end if;
 insert into public.ftz_activity_events(organization_id,admission_id,event_type,title,detail,source_type,source_id,metadata)
 values(v_org,p_admission_id,p_event_type,p_title,p_detail,p_source_type,p_source_id,coalesce(p_metadata,'{}')) returning id into v_id; return v_id;
end $$;
revoke execute on function public.nodara_ftz_record_event(uuid,text,text,text,text,uuid,jsonb) from public,anon;
grant execute on function public.nodara_ftz_record_event(uuid,text,text,text,text,uuid,jsonb) to authenticated;

create or replace function public.nodara_ftz_audit_admission() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  insert into public.ftz_audit_log(organization_id,admission_id,action,record_type,record_id,after_data) values(new.organization_id,new.id,'CREATE','FTZ_ADMISSION',new.id,to_jsonb(new));
  insert into public.ftz_activity_events(organization_id,admission_id,event_type,title,detail,source_type,source_id) values(new.organization_id,new.id,'ADMISSION_CREATED','Admission created',new.admission_number,'FTZ_ADMISSION',new.id);
  return new;
 elsif tg_op='UPDATE' then
  insert into public.ftz_audit_log(organization_id,admission_id,action,record_type,record_id,before_data,after_data) values(new.organization_id,new.id,'UPDATE','FTZ_ADMISSION',new.id,to_jsonb(old),to_jsonb(new));
  if old.admission_status is distinct from new.admission_status then insert into public.ftz_activity_events(organization_id,admission_id,event_type,title,detail,source_type,source_id,metadata) values(new.organization_id,new.id,'STATUS_CHANGED','Status changed',old.admission_status||' → '||new.admission_status,'FTZ_ADMISSION',new.id,jsonb_build_object('from',old.admission_status,'to',new.admission_status)); end if;
  return new;
 end if; return null;
end $$;
drop trigger if exists trg_ftz_audit_admission on public.ftz_admissions;
create trigger trg_ftz_audit_admission after insert or update on public.ftz_admissions for each row execute function public.nodara_ftz_audit_admission();

create or replace function public.nodara_ftz_audit_identity() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.ftz_audit_log(organization_id,admission_id,action,record_type,record_id,before_data,after_data)
 values(coalesce(new.organization_id,old.organization_id),coalesce(new.admission_id,old.admission_id),tg_op,'FTZ_INVENTORY_IDENTITY',coalesce(new.id,old.id),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
drop trigger if exists trg_ftz_audit_identity on public.ftz_inventory_identities;
create trigger trg_ftz_audit_identity after insert or update or delete on public.ftz_inventory_identities for each row execute function public.nodara_ftz_audit_identity();

create or replace view public.ftz_admission_timeline with (security_invoker=true) as
select e.organization_id,e.admission_id,e.event_at,e.event_type,e.title,e.detail,e.actor_id,e.source_type,e.source_id,e.metadata,'ACTIVITY'::text timeline_kind from public.ftz_activity_events e
union all
select ar.organization_id,ar.admission_id,ar.created_at,'WR_LINKED','Warehouse receipt linked',wr.receipt_number,ar.created_by,'WAREHOUSE_RECEIPT',ar.warehouse_receipt_id,'{}'::jsonb,'RECEIVING'::text
from public.ftz_admission_receipts ar join public.warehouse_receipts wr on wr.id=ar.warehouse_receipt_id;
