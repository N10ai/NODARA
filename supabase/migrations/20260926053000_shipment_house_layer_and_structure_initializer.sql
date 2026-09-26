create table if not exists public.shipment_houses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 shipment_id uuid not null references public.shipments(id) on delete restrict, house_number text,
 status text not null default 'DRAFT', shipper_id uuid, shipper_name text, shipper_address text, shipper_contact text,
 consignee_id uuid, consignee_name text, consignee_address text, consignee_contact text,
 notify_party_id uuid, notify_party_name text, notify_party_address text, notify_party_contact text,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(shipment_id)
);
create index if not exists shipment_houses_org_idx on public.shipment_houses(organization_id,shipment_id);
alter table public.shipment_houses enable row level security;
drop policy if exists shipment_houses_org on public.shipment_houses;
create policy shipment_houses_org on public.shipment_houses for all using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid())) with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));

create or replace function public.nodara_initialize_shipment_structure(p_shipment_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare s public.shipments; h uuid; c uuid; movement text; structure text;
begin
 select * into s from shipments where id=p_shipment_id; if s.id is null then raise exception 'Shipment not found'; end if;
 structure:=coalesce(s.metadata->>'document_structure','MASTER_ONLY'); movement:=coalesce(s.metadata->>'movement_type','STRAIGHT');
 if structure='HOUSE' then
  insert into shipment_houses(organization_id,shipment_id,house_number,shipper_id,shipper_name,shipper_address,shipper_contact,consignee_id,consignee_name,consignee_address,consignee_contact,metadata)
  values(s.organization_id,s.id,s.house_reference,s.shipper_id,s.shipper_name,s.shipper_address,s.shipper_contact,s.consignee_id,s.consignee_name,s.consignee_address,s.consignee_contact,jsonb_build_object('auto_created',true))
  on conflict(shipment_id) do update set updated_at=now() returning id into h;
 end if;
 if movement='CONSOLIDATION' then
  insert into consolidations(organization_id,consolidation_number,mode,status,origin_code,destination_code,master_reference,booking_reference,carrier_id,etd,eta,metadata)
  values(s.organization_id,'CON-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5)),s.mode,'PLANNING',s.origin_code,s.destination_code,s.master_reference,s.booking_reference,s.carrier_id,s.etd,s.eta,jsonb_build_object('created_from_shipment',s.id)) returning id into c;
  insert into consolidation_houses(organization_id,consolidation_id,shipment_id,sequence_no,readiness,load_plan) values(s.organization_id,c,s.id,1,'{}'::jsonb,'{}'::jsonb) on conflict(consolidation_id,shipment_id) do nothing;
 end if;
 return jsonb_build_object('shipment_id',s.id,'house_id',h,'consolidation_id',c,'document_structure',structure,'movement_type',movement);
end $$;
grant execute on function public.nodara_initialize_shipment_structure(uuid) to authenticated;