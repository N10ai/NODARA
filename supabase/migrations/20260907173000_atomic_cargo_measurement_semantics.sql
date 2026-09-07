create or replace function public.nodara_create_transaction_cargo_node(p_org uuid,p_transaction_type text,p_transaction_id uuid,p_node jsonb,p_parent uuid default null)
returns uuid language plpgsql security definer set search_path='public' as $$
declare id_out uuid; q numeric; defaults jsonb; dim_basis text; wt_basis text; m jsonb;
begin
 q:=coalesce(nullif(p_node->>'quantity','')::numeric,1);
 if q<=0 then raise exception 'Cargo quantity must be greater than zero'; end if;
 defaults:=coalesce(public.resolve_unit_defaults(p_org,upper(p_transaction_type)),'{}'::jsonb);
 dim_basis:=upper(coalesce(nullif(p_node->>'dimension_basis',''),'PER_UNIT'));
 wt_basis:=upper(coalesce(nullif(p_node->>'gross_weight_basis',''),'LINE_TOTAL'));
 if dim_basis not in ('PER_UNIT','LINE_TOTAL') then raise exception 'Invalid dimension basis'; end if;
 if wt_basis not in ('PER_UNIT','LINE_TOTAL') then raise exception 'Invalid gross weight basis'; end if;
 insert into public.cargo_objects(organization_id,source_type,source_id,parent_cargo_id,package_type,quantity,uom,description,gross_weight,weight_unit,length,width,height,dimension_unit,dimension_basis,gross_weight_basis,status,measurement_status,metadata)
 values(p_org,'TRANSACTION',p_transaction_id,p_parent,coalesce(nullif(p_node->>'package_type',''),'CARTON'),q,coalesce(nullif(p_node->>'uom',''),defaults->>'quantity_uom'),nullif(p_node->>'description',''),nullif(p_node->>'gross_weight','')::numeric,coalesce(nullif(p_node->>'weight_unit',''),defaults->>'weight_unit'),nullif(p_node->>'length','')::numeric,nullif(p_node->>'width','')::numeric,nullif(p_node->>'height','')::numeric,coalesce(nullif(p_node->>'dimension_unit',''),defaults->>'dimension_unit'),dim_basis,wt_basis,'ASSIGNED','DECLARED',jsonb_build_object('transaction_local',true,'transaction_type',upper(p_transaction_type),'part_number',nullif(p_node->>'part_number',''),'sku',nullif(p_node->>'sku',''),'barcode',nullif(p_node->>'barcode','')))
 returning id into id_out;
 m:=public.nodara_line_physical_metrics(q,nullif(p_node->>'length','')::numeric,nullif(p_node->>'width','')::numeric,nullif(p_node->>'height','')::numeric,coalesce(nullif(p_node->>'dimension_unit',''),defaults->>'dimension_unit'),nullif(p_node->>'gross_weight','')::numeric,coalesce(nullif(p_node->>'weight_unit',''),defaults->>'weight_unit'),dim_basis,wt_basis);
 update public.cargo_objects set calculated_volume_cbm=nullif(m->>'volume_cbm','')::numeric,calculated_gross_weight_kg=nullif(m->>'gross_weight_kg','')::numeric where id=id_out;
 if jsonb_typeof(p_node->'children')='array' then perform public.nodara_create_transaction_cargo_node(p_org,p_transaction_type,p_transaction_id,ch,id_out) from jsonb_array_elements(p_node->'children') ch; end if;
 return id_out;
end $$;

create or replace function public.nodara_update_transaction_cargo_atomic(p_transaction_type text,p_transaction_id uuid,p_cargo_object_id uuid,p_payload jsonb)
returns public.cargo_objects language plpgsql security definer set search_path='public' as $$
declare o uuid; c public.cargo_objects%rowtype; q numeric; dim_basis text; wt_basis text; m jsonb;
begin
 o:=public.nodara_transaction_org(p_transaction_type,p_transaction_id);
 if not public.nodara_is_org_member(o) then raise exception 'Workspace access denied'; end if;
 select * into c from public.cargo_objects where id=p_cargo_object_id for update;
 if c.id is null or c.organization_id<>o then raise exception 'Cargo not found in workspace'; end if;
 if c.source_type<>'TRANSACTION' or c.source_id<>p_transaction_id or coalesce((c.metadata->>'transaction_local')::boolean,false) is not true then raise exception 'Only transaction-local cargo may be edited here'; end if;
 q:=coalesce(nullif(p_payload->>'quantity','')::numeric,c.quantity,1); if q<=0 then raise exception 'Cargo quantity must be greater than zero'; end if;
 dim_basis:=upper(coalesce(nullif(p_payload->>'dimension_basis',''),c.dimension_basis,'PER_UNIT'));
 wt_basis:=upper(coalesce(nullif(p_payload->>'gross_weight_basis',''),c.gross_weight_basis,'LINE_TOTAL'));
 if dim_basis not in ('PER_UNIT','LINE_TOTAL') or wt_basis not in ('PER_UNIT','LINE_TOTAL') then raise exception 'Invalid measurement basis'; end if;
 update public.cargo_objects set
  package_type=coalesce(nullif(p_payload->>'package_type',''),package_type), quantity=q,
  description=case when p_payload ? 'description' then nullif(p_payload->>'description','') else description end,
  gross_weight=case when p_payload ? 'gross_weight' then nullif(p_payload->>'gross_weight','')::numeric else gross_weight end,
  weight_unit=coalesce(nullif(p_payload->>'weight_unit',''),weight_unit),
  length=case when p_payload ? 'length' then nullif(p_payload->>'length','')::numeric else length end,
  width=case when p_payload ? 'width' then nullif(p_payload->>'width','')::numeric else width end,
  height=case when p_payload ? 'height' then nullif(p_payload->>'height','')::numeric else height end,
  dimension_unit=coalesce(nullif(p_payload->>'dimension_unit',''),dimension_unit),
  dimension_basis=dim_basis,gross_weight_basis=wt_basis,
  metadata=metadata || jsonb_build_object('part_number',nullif(p_payload->>'part_number',''),'sku',nullif(p_payload->>'sku',''),'barcode',nullif(p_payload->>'barcode','')),
  updated_at=now()
 where id=c.id returning * into c;
 m:=public.nodara_line_physical_metrics(c.quantity,c.length,c.width,c.height,c.dimension_unit,c.gross_weight,c.weight_unit,c.dimension_basis,c.gross_weight_basis);
 update public.cargo_objects set calculated_volume_cbm=nullif(m->>'volume_cbm','')::numeric,calculated_gross_weight_kg=nullif(m->>'gross_weight_kg','')::numeric,measurement_status='DECLARED',updated_at=now() where id=c.id returning * into c;
 return c;
end $$;

revoke all on function public.nodara_create_transaction_cargo_node(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.nodara_update_transaction_cargo_atomic(text,uuid,uuid,jsonb) from public,anon;
grant execute on function public.nodara_update_transaction_cargo_atomic(text,uuid,uuid,jsonb) to authenticated;
