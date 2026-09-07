-- Generic transaction projections, calculation snapshots, activity, and canonical commands.

create or replace function public.nodara_sync_domain_parties_references()
returns trigger language plpgsql security definer set search_path=public as $$
declare txid uuid; r record;
begin
  if tg_op='DELETE' then return old; end if;
  select id into txid from public.transactions where organization_id=new.organization_id and domain_record_id=new.id and transaction_type=case tg_table_name when 'shipments' then 'SHIPMENT' when 'cargo_releases' then 'CARGO_RELEASE' when 'transport_orders' then 'TRANSPORT_ORDER' else 'UNKNOWN' end;
  if txid is null then return new; end if;
  delete from public.transaction_parties where transaction_id=txid and source='DOMAIN_PROJECTION';
  delete from public.transaction_references where transaction_id=txid and source='DOMAIN_PROJECTION';
  if tg_table_name='shipments' then
    for r in select * from (values ('CUSTOMER',new.customer_id),('SHIPPER',new.shipper_id),('CONSIGNEE',new.consignee_id),('CARRIER',new.carrier_id)) v(role_code,entity_id) loop
      if r.entity_id is not null then insert into public.transaction_parties(organization_id,transaction_id,role_code,entity_id,party_name_snapshot,is_primary,source,provenance) select new.organization_id,txid,r.role_code,r.entity_id,e.name,true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now()) from public.entities e where e.id=r.entity_id; end if;
    end loop;
    for r in select * from (values ('CUSTOMER_REFERENCE',new.reference),('MASTER_REFERENCE',new.master_reference),('HOUSE_REFERENCE',new.house_reference),('BOOKING',new.booking_reference)) v(reference_type,reference_value) loop
      if nullif(btrim(r.reference_value),'') is not null then insert into public.transaction_references(organization_id,transaction_id,reference_type,reference_value,is_primary,source,provenance) values(new.organization_id,txid,r.reference_type,btrim(r.reference_value),true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now())) on conflict do nothing; end if;
    end loop;
  elsif tg_table_name='cargo_releases' then
    for r in select * from (values ('CUSTOMER',new.customer_id),('CONSIGNEE',new.consignee_id),('CARRIER',new.carrier_id)) v(role_code,entity_id) loop
      if r.entity_id is not null then insert into public.transaction_parties(organization_id,transaction_id,role_code,entity_id,party_name_snapshot,is_primary,source,provenance) select new.organization_id,txid,r.role_code,r.entity_id,e.name,true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now()) from public.entities e where e.id=r.entity_id; end if;
    end loop;
    if nullif(btrim(new.reference),'') is not null then insert into public.transaction_references(organization_id,transaction_id,reference_type,reference_value,is_primary,source,provenance) values(new.organization_id,txid,'CUSTOMER_REFERENCE',btrim(new.reference),true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now())) on conflict do nothing; end if;
  elsif tg_table_name='transport_orders' then
    for r in select * from (values ('CUSTOMER',new.customer_id),('CARRIER',new.carrier_id),('PICKUP_LOCATION',new.pickup_entity_id),('DELIVERY_LOCATION',new.delivery_entity_id)) v(role_code,entity_id) loop
      if r.entity_id is not null then insert into public.transaction_parties(organization_id,transaction_id,role_code,entity_id,party_name_snapshot,is_primary,source,provenance) select new.organization_id,txid,r.role_code,r.entity_id,e.name,true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now()) from public.entities e where e.id=r.entity_id; end if;
    end loop;
    for r in select * from (values ('CUSTOMER_REFERENCE',new.customer_reference),('CARRIER_REFERENCE',new.carrier_reference)) v(reference_type,reference_value) loop
      if nullif(btrim(r.reference_value),'') is not null then insert into public.transaction_references(organization_id,transaction_id,reference_type,reference_value,is_primary,source,provenance) values(new.organization_id,txid,r.reference_type,btrim(r.reference_value),true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now())) on conflict do nothing; end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_domain_projection_shipment on public.shipments;
drop trigger if exists trg_domain_projection_cr on public.cargo_releases;
drop trigger if exists trg_domain_projection_transport on public.transport_orders;
drop trigger if exists trg_z_domain_projection_shipment on public.shipments;
drop trigger if exists trg_z_domain_projection_cr on public.cargo_releases;
drop trigger if exists trg_z_domain_projection_transport on public.transport_orders;
create trigger trg_z_domain_projection_shipment after insert or update on public.shipments for each row execute function public.nodara_sync_domain_parties_references();
create trigger trg_z_domain_projection_cr after insert or update on public.cargo_releases for each row execute function public.nodara_sync_domain_parties_references();
create trigger trg_z_domain_projection_transport after insert or update on public.transport_orders for each row execute function public.nodara_sync_domain_parties_references();

create table if not exists public.calculation_snapshots (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade, target_type text not null, target_id uuid not null,
  calculation_type text not null, scope_type text, scope_id uuid, input_snapshot jsonb not null default '{}'::jsonb,
  normalized_input jsonb not null default '{}'::jsonb, rule_code text, rule_source_type text, rule_source_id uuid,
  formula_version text not null default '1', result_value numeric, result_unit text, result_json jsonb not null default '{}'::jsonb,
  rounding_rule jsonb not null default '{}'::jsonb, supersedes_id uuid references public.calculation_snapshots(id) on delete set null,
  status text not null default 'CURRENT', provenance jsonb not null default '{}'::jsonb, calculated_by uuid,
  calculated_at timestamptz not null default now(), created_at timestamptz not null default now(),
  check (status in ('CURRENT','SUPERSEDED','VOID'))
);
create index if not exists calculation_snapshots_target_idx on public.calculation_snapshots(organization_id,target_type,target_id,calculation_type,calculated_at desc);
create unique index if not exists calculation_snapshots_current_uq on public.calculation_snapshots(organization_id,target_type,target_id,calculation_type,coalesce(scope_type,''),coalesce(scope_id,'00000000-0000-0000-0000-000000000000'::uuid)) where status='CURRENT';
alter table public.calculation_snapshots enable row level security;
drop policy if exists calculation_snapshots_org_access on public.calculation_snapshots;
create policy calculation_snapshots_org_access on public.calculation_snapshots for all using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));

create table if not exists public.transaction_activity_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade, event_type text not null, domain text not null default 'TRANSACTION',
  actor_id uuid, source_type text not null default 'SYSTEM', occurred_at timestamptz not null default now(), summary text,
  payload jsonb not null default '{}'::jsonb, correlation_id uuid, provenance jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists transaction_activity_events_txn_idx on public.transaction_activity_events(transaction_id,occurred_at desc);
alter table public.transaction_activity_events enable row level security;
drop policy if exists transaction_activity_events_org_access on public.transaction_activity_events;
create policy transaction_activity_events_org_access on public.transaction_activity_events for all using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));

create or replace function public.nodara_record_activity(p_transaction_id uuid,p_event_type text,p_domain text default 'TRANSACTION',p_summary text default null,p_payload jsonb default '{}'::jsonb,p_provenance jsonb default '{}'::jsonb,p_correlation_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare tx public.transactions%rowtype; eid uuid;
begin
 select * into tx from public.transactions where id=p_transaction_id; if tx.id is null then raise exception 'Transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if;
 insert into public.transaction_activity_events(organization_id,transaction_id,event_type,domain,actor_id,source_type,summary,payload,correlation_id,provenance)
 values(tx.organization_id,tx.id,upper(p_event_type),coalesce(nullif(upper(p_domain),''),'TRANSACTION'),auth.uid(),coalesce(p_provenance->>'source_type','SYSTEM'),p_summary,coalesce(p_payload,'{}'::jsonb),p_correlation_id,coalesce(p_provenance,'{}'::jsonb)) returning id into eid;
 return eid;
end $$;

create or replace function public.nodara_write_calculation_snapshot(p_transaction_id uuid,p_target_type text,p_target_id uuid,p_calculation_type text,p_scope_type text default null,p_scope_id uuid default null,p_input_snapshot jsonb default '{}'::jsonb,p_normalized_input jsonb default '{}'::jsonb,p_rule_code text default null,p_rule_source_type text default null,p_rule_source_id uuid default null,p_formula_version text default '1',p_result_value numeric default null,p_result_unit text default null,p_result_json jsonb default '{}'::jsonb,p_rounding_rule jsonb default '{}'::jsonb,p_provenance jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare tx public.transactions%rowtype; oldid uuid; newid uuid;
begin
 select * into tx from public.transactions where id=p_transaction_id; if tx.id is null then raise exception 'Transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if;
 select id into oldid from public.calculation_snapshots where organization_id=tx.organization_id and target_type=upper(p_target_type) and target_id=p_target_id and calculation_type=upper(p_calculation_type) and coalesce(scope_type,'')=coalesce(upper(p_scope_type),'') and coalesce(scope_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_scope_id,'00000000-0000-0000-0000-000000000000'::uuid) and status='CURRENT' for update;
 if oldid is not null then update public.calculation_snapshots set status='SUPERSEDED' where id=oldid; end if;
 insert into public.calculation_snapshots(organization_id,transaction_id,target_type,target_id,calculation_type,scope_type,scope_id,input_snapshot,normalized_input,rule_code,rule_source_type,rule_source_id,formula_version,result_value,result_unit,result_json,rounding_rule,supersedes_id,status,provenance,calculated_by)
 values(tx.organization_id,tx.id,upper(p_target_type),p_target_id,upper(p_calculation_type),case when p_scope_type is null then null else upper(p_scope_type) end,p_scope_id,coalesce(p_input_snapshot,'{}'::jsonb),coalesce(p_normalized_input,'{}'::jsonb),p_rule_code,p_rule_source_type,p_rule_source_id,coalesce(p_formula_version,'1'),p_result_value,upper(p_result_unit),coalesce(p_result_json,'{}'::jsonb),coalesce(p_rounding_rule,'{}'::jsonb),oldid,'CURRENT',coalesce(p_provenance,'{}'::jsonb),auth.uid()) returning id into newid;
 perform public.nodara_record_activity(tx.id,'CALCULATION_UPDATED','CALCULATION',upper(p_calculation_type),jsonb_build_object('calculation_id',newid,'result_value',p_result_value,'result_unit',upper(p_result_unit),'rule_code',p_rule_code),coalesce(p_provenance,'{}'::jsonb),null);
 return newid;
end $$;

-- Canonical relation command.
create or replace function public.nodara_relate_transactions(p_from_transaction_id uuid,p_relationship_type text,p_to_transaction_id uuid,p_is_primary boolean default false,p_provenance jsonb default '{}'::jsonb,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare f public.transactions%rowtype; t public.transactions%rowtype; rid uuid;
begin
 select * into f from public.transactions where id=p_from_transaction_id; select * into t from public.transactions where id=p_to_transaction_id;
 if f.id is null or t.id is null then raise exception 'Transaction not found'; end if; if f.organization_id<>t.organization_id then raise exception 'Transactions must belong to same workspace'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(f.organization_id) then raise exception 'Workspace access denied'; end if; if f.id=t.id then raise exception 'Transaction cannot relate to itself'; end if;
 if p_is_primary then update public.transaction_relationships set is_primary=false where from_transaction_id=f.id and relationship_type=upper(p_relationship_type) and is_primary; end if;
 insert into public.transaction_relationships(organization_id,from_transaction_id,relationship_type,to_transaction_id,is_primary,metadata,provenance,created_by)
 values(f.organization_id,f.id,upper(p_relationship_type),t.id,p_is_primary,coalesce(p_metadata,'{}'::jsonb),coalesce(p_provenance,'{}'::jsonb),auth.uid()) on conflict(from_transaction_id,relationship_type,to_transaction_id) do update set is_primary=excluded.is_primary,metadata=public.transaction_relationships.metadata||excluded.metadata,provenance=excluded.provenance returning id into rid;
 perform public.nodara_record_activity(f.id,'TRANSACTION_RELATED','RELATIONSHIP',upper(p_relationship_type)||' → '||coalesce(t.document_number,t.transaction_type),jsonb_build_object('relationship_id',rid,'relationship_type',upper(p_relationship_type),'to_transaction_id',t.id),coalesce(p_provenance,'{}'::jsonb),null); return rid;
end $$;
