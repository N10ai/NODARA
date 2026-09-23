-- NODARA canonical operational record lifecycle foundation
alter table public.operational_links
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists operational_links_unique_active_relation
on public.operational_links(organization_id,source_type,source_id,target_type,target_id,relationship)
where active=true;

create index if not exists operational_links_source_active_idx
on public.operational_links(organization_id,source_type,source_id) where active=true;
create index if not exists operational_links_target_active_idx
on public.operational_links(organization_id,target_type,target_id) where active=true;

create or replace function public.nodara_record_has_links(p_organization_id uuid,p_record_type text,p_record_id uuid)
returns boolean language sql stable security invoker as $$
 select exists(
  select 1 from public.operational_links l
  where l.organization_id=p_organization_id and l.active=true
    and ((l.source_type=p_record_type and l.source_id=p_record_id)
      or (l.target_type=p_record_type and l.target_id=p_record_id))
 );
$$;

create or replace function public.nodara_record_links(p_organization_id uuid,p_record_type text,p_record_id uuid)
returns setof public.operational_links language sql stable security invoker as $$
 select * from public.operational_links l
 where l.organization_id=p_organization_id and l.active=true
   and ((l.source_type=p_record_type and l.source_id=p_record_id)
     or (l.target_type=p_record_type and l.target_id=p_record_id))
 order by l.created_at;
$$;

create or replace function public.nodara_protect_linked_operational_record()
returns trigger language plpgsql as $$
declare v_type text; v_id uuid; v_org uuid;
begin
 v_type:=tg_argv[0]; v_id:=old.id; v_org:=old.organization_id;
 if public.nodara_record_has_links(v_org,v_type,v_id) then
   raise exception 'This % is linked to another operational record and cannot be deleted. Void/cancel it instead to preserve history.',v_type using errcode='23503';
 end if;
 return old;
end $$;

drop trigger if exists protect_linked_wr_delete on public.warehouse_receipts;
create trigger protect_linked_wr_delete before delete on public.warehouse_receipts
for each row execute function public.nodara_protect_linked_operational_record('WAREHOUSE_RECEIPT');
drop trigger if exists protect_linked_cr_delete on public.cargo_releases;
create trigger protect_linked_cr_delete before delete on public.cargo_releases
for each row execute function public.nodara_protect_linked_operational_record('CARGO_RELEASE');
drop trigger if exists protect_linked_shipment_delete on public.shipments;
create trigger protect_linked_shipment_delete before delete on public.shipments
for each row execute function public.nodara_protect_linked_operational_record('SHIPMENT');
drop trigger if exists protect_linked_transport_delete on public.transport_orders;
create trigger protect_linked_transport_delete before delete on public.transport_orders
for each row execute function public.nodara_protect_linked_operational_record('TRANSPORT_ORDER');

comment on table public.operational_links is 'Canonical NODARA operational record graph. Links WR, CR, Shipment, Transport Order and future transaction records without collapsing their independent lifecycles.';
