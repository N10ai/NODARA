-- Canonical Party/Reference commands plus explicit cargo measurement semantics.

create or replace function public.nodara_add_transaction_party(p_transaction_id uuid,p_role_code text,p_entity_id uuid default null,p_contact_id uuid default null,p_address_id uuid default null,p_is_primary boolean default true,p_provenance jsonb default '{}'::jsonb,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare tx public.transactions%rowtype; pname text; cs jsonb:='{}'::jsonb; ads jsonb:='{}'::jsonb; pid uuid; role text:=upper(p_role_code); handled boolean:=false;
begin
 select * into tx from public.transactions where id=p_transaction_id; if tx.id is null then raise exception 'Transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if;
 if p_entity_id is not null then select name into pname from public.entities where id=p_entity_id and organization_id=tx.organization_id; if pname is null then raise exception 'Entity not found in workspace'; end if; end if;
 if p_contact_id is not null then select jsonb_build_object('id',id,'name',name,'title',title,'email',email,'phone',phone) into cs from public.entity_contacts where id=p_contact_id and organization_id=tx.organization_id; if cs is null then raise exception 'Contact not found in workspace'; end if; end if;
 if p_address_id is not null then select jsonb_build_object('id',id,'name',name,'line1',line1,'line2',line2,'city',city,'state_region',state_region,'postal_code',postal_code,'country_code',country_code) into ads from public.entity_addresses where id=p_address_id and organization_id=tx.organization_id; if ads is null then raise exception 'Address not found in workspace'; end if; end if;
 if p_is_primary and p_entity_id is not null then
   if tx.transaction_type='SHIPMENT' then
     if role='CUSTOMER' then update public.shipments set customer_id=p_entity_id where id=tx.domain_record_id; handled:=true;
     elsif role='SHIPPER' then update public.shipments set shipper_id=p_entity_id where id=tx.domain_record_id; handled:=true;
     elsif role='CONSIGNEE' then update public.shipments set consignee_id=p_entity_id where id=tx.domain_record_id; handled:=true;
     elsif role='CARRIER' then update public.shipments set carrier_id=p_entity_id where id=tx.domain_record_id; handled:=true; end if;
   elsif tx.transaction_type='CARGO_RELEASE' then
     if role='CUSTOMER' then update public.cargo_releases set customer_id=p_entity_id where id=tx.domain_record_id; handled:=true;
     elsif role='CONSIGNEE' then update public.cargo_releases set consignee_id=p_entity_id where id=tx.domain_record_id; handled:=true;
     elsif role='CARRIER' then update public.cargo_releases set carrier_id=p_entity_id where id=tx.domain_record_id; handled:=true; end if;
   elsif tx.transaction_type='TRANSPORT_ORDER' then
     if role='CUSTOMER' then update public.transport_orders set customer_id=p_entity_id where id=tx.domain_record_id; handled:=true;
     elsif role='CARRIER' then update public.transport_orders set carrier_id=p_entity_id where id=tx.domain_record_id; handled:=true;
     elsif role='PICKUP_LOCATION' then update public.transport_orders set pickup_entity_id=p_entity_id where id=tx.domain_record_id; handled:=true;
     elsif role='DELIVERY_LOCATION' then update public.transport_orders set delivery_entity_id=p_entity_id where id=tx.domain_record_id; handled:=true; end if;
   end if;
 end if;
 if handled then
   select id into pid from public.transaction_parties where transaction_id=tx.id and role_code=role and is_primary order by updated_at desc limit 1;
   if p_contact_id is not null or p_address_id is not null then update public.transaction_parties set contact_id=p_contact_id,address_id=p_address_id,contact_snapshot=coalesce(cs,'{}'::jsonb),address_snapshot=coalesce(ads,'{}'::jsonb),provenance=coalesce(p_provenance,'{}'::jsonb),metadata=metadata||coalesce(p_metadata,'{}'::jsonb),updated_at=now() where id=pid; end if;
 else
   if p_is_primary then update public.transaction_parties set is_primary=false,updated_at=now() where transaction_id=tx.id and role_code=role and is_primary; end if;
   insert into public.transaction_parties(organization_id,transaction_id,role_code,entity_id,contact_id,address_id,party_name_snapshot,contact_snapshot,address_snapshot,is_primary,source,provenance,metadata)
   values(tx.organization_id,tx.id,role,p_entity_id,p_contact_id,p_address_id,pname,coalesce(cs,'{}'::jsonb),coalesce(ads,'{}'::jsonb),p_is_primary,coalesce(p_provenance->>'source_type','USER'),coalesce(p_provenance,'{}'::jsonb),coalesce(p_metadata,'{}'::jsonb)) returning id into pid;
 end if;
 perform public.nodara_record_activity(tx.id,'PARTY_ADDED','PARTY',role||coalesce(': '||pname,''),jsonb_build_object('party_id',pid,'role_code',role,'entity_id',p_entity_id,'domain_projection',handled),coalesce(p_provenance,'{}'::jsonb),null); return pid;
end $$;

create or replace function public.nodara_remove_transaction_party(p_party_id uuid,p_provenance jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.transaction_parties%rowtype;
begin
 select * into p from public.transaction_parties where id=p_party_id; if p.id is null then return false; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(p.organization_id) then raise exception 'Workspace access denied'; end if;
 delete from public.transaction_parties where id=p.id; perform public.nodara_record_activity(p.transaction_id,'PARTY_REMOVED','PARTY',p.role_code,jsonb_build_object('party_id',p.id,'role_code',p.role_code,'entity_id',p.entity_id),coalesce(p_provenance,'{}'::jsonb),null); return true;
end $$;

create or replace function public.nodara_add_transaction_reference(p_transaction_id uuid,p_reference_type text,p_reference_value text,p_issuer_entity_id uuid default null,p_is_primary boolean default false,p_provenance jsonb default '{}'::jsonb,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare tx public.transactions%rowtype; rid uuid; existing uuid; rt text:=upper(p_reference_type); rv text:=btrim(p_reference_value); handled boolean:=false;
begin
 select * into tx from public.transactions where id=p_transaction_id; if tx.id is null then raise exception 'Transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if;
 if p_issuer_entity_id is not null and not exists(select 1 from public.entities where id=p_issuer_entity_id and organization_id=tx.organization_id) then raise exception 'Issuer entity not found in workspace'; end if;
 if nullif(rv,'') is null then raise exception 'Reference cannot be blank'; end if;
 if p_is_primary then
   if tx.transaction_type='SHIPMENT' then
     if rt='CUSTOMER_REFERENCE' then update public.shipments set reference=rv where id=tx.domain_record_id; handled:=true;
     elsif rt in ('MASTER_REFERENCE','MAWB','MBL') then update public.shipments set master_reference=rv where id=tx.domain_record_id; handled:=true;
     elsif rt in ('HOUSE_REFERENCE','HAWB','HBL') then update public.shipments set house_reference=rv where id=tx.domain_record_id; handled:=true;
     elsif rt='BOOKING' then update public.shipments set booking_reference=rv where id=tx.domain_record_id; handled:=true; end if;
   elsif tx.transaction_type='CARGO_RELEASE' and rt='CUSTOMER_REFERENCE' then update public.cargo_releases set reference=rv where id=tx.domain_record_id; handled:=true;
   elsif tx.transaction_type='TRANSPORT_ORDER' then
     if rt='CUSTOMER_REFERENCE' then update public.transport_orders set customer_reference=rv where id=tx.domain_record_id; handled:=true;
     elsif rt='CARRIER_REFERENCE' then update public.transport_orders set carrier_reference=rv where id=tx.domain_record_id; handled:=true; end if;
   end if;
 end if;
 if handled then
   select id into rid from public.transaction_references where transaction_id=tx.id and reference_type=case when rt in ('MAWB','MBL') then 'MASTER_REFERENCE' when rt in ('HAWB','HBL') then 'HOUSE_REFERENCE' else rt end and is_primary limit 1;
   if rid is not null then update public.transaction_references set issuer_entity_id=coalesce(p_issuer_entity_id,issuer_entity_id),provenance=coalesce(p_provenance,'{}'::jsonb),metadata=metadata||coalesce(p_metadata,'{}'::jsonb) where id=rid; end if;
 else
   if p_is_primary then update public.transaction_references set is_primary=false where transaction_id=tx.id and reference_type=rt and is_primary; end if;
   select id into existing from public.transaction_references where transaction_id=tx.id and reference_type=rt and reference_value=rv;
   if existing is not null then update public.transaction_references set is_primary=p_is_primary,issuer_entity_id=coalesce(p_issuer_entity_id,issuer_entity_id),provenance=coalesce(p_provenance,provenance),metadata=metadata||coalesce(p_metadata,'{}'::jsonb) where id=existing returning id into rid;
   else insert into public.transaction_references(organization_id,transaction_id,reference_type,reference_value,issuer_entity_id,is_primary,source,provenance,metadata) values(tx.organization_id,tx.id,rt,rv,p_issuer_entity_id,p_is_primary,coalesce(p_provenance->>'source_type','USER'),coalesce(p_provenance,'{}'::jsonb),coalesce(p_metadata,'{}'::jsonb)) returning id into rid; end if;
 end if;
 perform public.nodara_record_activity(tx.id,'REFERENCE_ADDED','REFERENCE',rt||': '||rv,jsonb_build_object('reference_id',rid,'reference_type',rt,'reference_value',rv,'domain_projection',handled),coalesce(p_provenance,'{}'::jsonb),null); return rid;
end $$;

create or replace function public.nodara_remove_transaction_reference(p_reference_id uuid,p_provenance jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.transaction_references%rowtype;
begin
 select * into r from public.transaction_references where id=p_reference_id; if r.id is null then return false; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(r.organization_id) then raise exception 'Workspace access denied'; end if;
 delete from public.transaction_references where id=r.id; perform public.nodara_record_activity(r.transaction_id,'REFERENCE_REMOVED','REFERENCE',r.reference_type||': '||r.reference_value,jsonb_build_object('reference_id',r.id,'reference_type',r.reference_type,'reference_value',r.reference_value),coalesce(p_provenance,'{}'::jsonb),null); return true;
end $$;

alter table public.cargo_objects add column if not exists dimension_basis text not null default 'PER_UNIT';
alter table public.cargo_objects add column if not exists gross_weight_basis text not null default 'LINE_TOTAL';
alter table public.cargo_objects add column if not exists measurement_status text not null default 'UNVERIFIED';
alter table public.cargo_objects add column if not exists calculated_volume_cbm numeric;
alter table public.cargo_objects add column if not exists calculated_gross_weight_kg numeric;
alter table public.cargo_objects drop constraint if exists cargo_objects_dimension_basis_chk;
alter table public.cargo_objects add constraint cargo_objects_dimension_basis_chk check (dimension_basis in ('PER_UNIT','LINE_TOTAL','MEASURED_OBJECT'));
alter table public.cargo_objects drop constraint if exists cargo_objects_gross_weight_basis_chk;
alter table public.cargo_objects add constraint cargo_objects_gross_weight_basis_chk check (gross_weight_basis in ('PER_UNIT','LINE_TOTAL','MEASURED_OBJECT'));
alter table public.cargo_objects drop constraint if exists cargo_objects_measurement_status_chk;
alter table public.cargo_objects add constraint cargo_objects_measurement_status_chk check (measurement_status in ('UNVERIFIED','VERIFIED','ESTIMATED','IMPORTED'));

alter table public.cargo_units add column if not exists dimension_basis text not null default 'PER_UNIT';
alter table public.cargo_units add column if not exists gross_weight_basis text not null default 'LINE_TOTAL';
alter table public.cargo_units add column if not exists measurement_status text not null default 'UNVERIFIED';
alter table public.cargo_units drop constraint if exists cargo_units_dimension_basis_chk;
alter table public.cargo_units add constraint cargo_units_dimension_basis_chk check (dimension_basis in ('PER_UNIT','LINE_TOTAL','MEASURED_OBJECT'));
alter table public.cargo_units drop constraint if exists cargo_units_gross_weight_basis_chk;
alter table public.cargo_units add constraint cargo_units_gross_weight_basis_chk check (gross_weight_basis in ('PER_UNIT','LINE_TOTAL','MEASURED_OBJECT'));
alter table public.cargo_units drop constraint if exists cargo_units_measurement_status_chk;
alter table public.cargo_units add constraint cargo_units_measurement_status_chk check (measurement_status in ('UNVERIFIED','VERIFIED','ESTIMATED','IMPORTED'));

create or replace function public.nodara_line_physical_metrics(p_quantity numeric,p_length numeric,p_width numeric,p_height numeric,p_dimension_unit text,p_gross_weight numeric,p_weight_unit text,p_dimension_basis text default 'PER_UNIT',p_gross_weight_basis text default 'LINE_TOTAL')
returns jsonb language plpgsql immutable as $$
declare q numeric:=greatest(coalesce(p_quantity,1),0); lm numeric; wm numeric; hm numeric; vol numeric; kg numeric; dim_factor numeric; weight_factor numeric;
begin
 dim_factor:=case upper(coalesce(p_dimension_unit,'IN')) when 'MM' then 0.001 when 'CM' then 0.01 when 'M' then 1 when 'IN' then 0.0254 when 'FT' then 0.3048 else null end;
 weight_factor:=case upper(coalesce(p_weight_unit,'LB')) when 'KG' then 1 when 'LB' then 0.45359237 when 'G' then 0.001 when 'OZ' then 0.028349523125 else null end;
 if dim_factor is not null and p_length is not null and p_width is not null and p_height is not null then lm:=p_length*dim_factor; wm:=p_width*dim_factor; hm:=p_height*dim_factor; vol:=lm*wm*hm; if upper(coalesce(p_dimension_basis,'PER_UNIT'))='PER_UNIT' then vol:=vol*q; end if; end if;
 if weight_factor is not null and p_gross_weight is not null then kg:=p_gross_weight*weight_factor; if upper(coalesce(p_gross_weight_basis,'LINE_TOTAL'))='PER_UNIT' then kg:=kg*q; end if; end if;
 return jsonb_build_object('quantity',q,'volume_cbm',vol,'gross_weight_kg',kg,'dimension_basis',upper(coalesce(p_dimension_basis,'PER_UNIT')),'gross_weight_basis',upper(coalesce(p_gross_weight_basis,'LINE_TOTAL')),'dimension_unit',upper(coalesce(p_dimension_unit,'IN')),'weight_unit',upper(coalesce(p_weight_unit,'LB')));
end $$;

create or replace function public.nodara_recalculate_cargo_object_physical(p_transaction_id uuid,p_cargo_object_id uuid,p_provenance jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tx public.transactions%rowtype; c public.cargo_objects%rowtype; m jsonb; vol numeric; kg numeric;
begin
 select * into tx from public.transactions where id=p_transaction_id; if tx.id is null then raise exception 'Transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if;
 select * into c from public.cargo_objects where id=p_cargo_object_id and organization_id=tx.organization_id; if c.id is null then raise exception 'Cargo object not found in workspace'; end if;
 m:=public.nodara_line_physical_metrics(c.quantity,c.length,c.width,c.height,c.dimension_unit,c.gross_weight,c.weight_unit,c.dimension_basis,c.gross_weight_basis); vol:=nullif(m->>'volume_cbm','')::numeric; kg:=nullif(m->>'gross_weight_kg','')::numeric;
 update public.cargo_objects set calculated_volume_cbm=vol,calculated_gross_weight_kg=kg,updated_at=now() where id=c.id;
 if vol is not null then perform public.nodara_write_calculation_snapshot(tx.id,'CARGO_OBJECT',c.id,'PHYSICAL_VOLUME','CARGO_OBJECT',c.id,jsonb_build_object('quantity',c.quantity,'length',c.length,'width',c.width,'height',c.height,'dimension_unit',c.dimension_unit,'dimension_basis',c.dimension_basis),jsonb_build_object('volume_cbm',vol),null,'SYSTEM',null,'1',vol,'CBM',m,'{}'::jsonb,coalesce(p_provenance,jsonb_build_object('source_type','SYSTEM_CALC'))); end if;
 if kg is not null then perform public.nodara_write_calculation_snapshot(tx.id,'CARGO_OBJECT',c.id,'TOTAL_GROSS_WEIGHT','CARGO_OBJECT',c.id,jsonb_build_object('quantity',c.quantity,'gross_weight',c.gross_weight,'weight_unit',c.weight_unit,'gross_weight_basis',c.gross_weight_basis),jsonb_build_object('gross_weight_kg',kg),null,'SYSTEM',null,'1',kg,'KG',m,'{}'::jsonb,coalesce(p_provenance,jsonb_build_object('source_type','SYSTEM_CALC'))); end if;
 return m;
end $$;

create or replace function public.nodara_calculate_air_chargeable_weight(p_transaction_id uuid,p_divisor numeric,p_rule_code text default null,p_rule_source_type text default null,p_rule_source_id uuid default null,p_provenance jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tx public.transactions%rowtype; r record; m jsonb; total_cbm numeric:=0; total_kg numeric:=0; vkg numeric; chargeable numeric; result jsonb;
begin
 if p_divisor is null or p_divisor<=0 then raise exception 'A positive volumetric divisor is required'; end if;
 select * into tx from public.transactions where id=p_transaction_id; if tx.id is null then raise exception 'Transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if;
 for r in select distinct c.* from public.cargo_assignments a join public.cargo_objects c on c.id=a.cargo_object_id where a.transaction_id=tx.domain_record_id and a.transaction_type=tx.transaction_type and a.status<>'REMOVED' and c.organization_id=tx.organization_id loop
   m:=public.nodara_line_physical_metrics(r.quantity,r.length,r.width,r.height,r.dimension_unit,r.gross_weight,r.weight_unit,r.dimension_basis,r.gross_weight_basis);
   total_cbm:=total_cbm+coalesce(nullif(m->>'volume_cbm','')::numeric,coalesce(r.calculated_volume_cbm,r.volume_cbm,0)); total_kg:=total_kg+coalesce(nullif(m->>'gross_weight_kg','')::numeric,coalesce(r.calculated_gross_weight_kg,0));
 end loop;
 vkg:=round((total_cbm*1000000/p_divisor)::numeric,3); chargeable:=greatest(total_kg,vkg); result:=jsonb_build_object('gross_weight_kg',total_kg,'volume_cbm',total_cbm,'volumetric_weight_kg',vkg,'chargeable_weight_kg',chargeable,'divisor_cm3_per_kg',p_divisor);
 perform public.nodara_write_calculation_snapshot(tx.id,tx.transaction_type,tx.domain_record_id,'AIR_CHARGEABLE_WEIGHT','TRANSACTION',tx.id,jsonb_build_object('gross_weight_kg',total_kg,'volume_cbm',total_cbm,'divisor',p_divisor),jsonb_build_object('volume_cm3',total_cbm*1000000),p_rule_code,p_rule_source_type,p_rule_source_id,'1',chargeable,'KG',result,jsonb_build_object('decimals',3),coalesce(p_provenance,jsonb_build_object('source_type','SYSTEM_CALC'))); return result;
end $$;
