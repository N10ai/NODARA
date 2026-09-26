-- Keep direct transaction cargo creation aligned with cargo_objects_measurement_status_chk.
-- DECLARED is not a valid measurement_status; direct user-entered measurements begin UNVERIFIED.
create or replace function public.nodara_create_transaction_cargo_node(p_org uuid, p_transaction_type text, p_transaction_id uuid, p_node jsonb, p_parent uuid default null::uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare id_out uuid; q numeric; defaults jsonb; dim_basis text; wt_basis text; m jsonb;
begin
 q:=coalesce(nullif(p_node->>'quantity','')::numeric,1); if q<=0 then raise exception 'Cargo quantity must be greater than zero'; end if;
 defaults:=coalesce(public.resolve_unit_defaults(p_org,upper(p_transaction_type)),'{}'::jsonb);
 dim_basis:=upper(coalesce(nullif(p_node->>'dimension_basis',''),'PER_UNIT')); wt_basis:=upper(coalesce(nullif(p_node->>'gross_weight_basis',''),'LINE_TOTAL'));
 if dim_basis not in ('PER_UNIT','LINE_TOTAL') then raise exception 'Invalid dimension basis'; end if; if wt_basis not in ('PER_UNIT','LINE_TOTAL') then raise exception 'Invalid gross weight basis'; end if;
 insert into public.cargo_objects(organization_id,source_type,source_id,parent_cargo_id,package_type,quantity,uom,description,gross_weight,weight_unit,length,width,height,dimension_unit,dimension_basis,gross_weight_basis,status,measurement_status,metadata)
 values(p_org,'TRANSACTION',p_transaction_id,p_parent,coalesce(nullif(p_node->>'package_type',''),'CARTON'),q,coalesce(nullif(p_node->>'uom',''),defaults->>'quantity_uom'),nullif(p_node->>'description',''),nullif(p_node->>'gross_weight','')::numeric,coalesce(nullif(p_node->>'weight_unit',''),defaults->>'weight_unit'),nullif(p_node->>'length','')::numeric,nullif(p_node->>'width','')::numeric,nullif(p_node->>'height','')::numeric,coalesce(nullif(p_node->>'dimension_unit',''),defaults->>'dimension_unit'),dim_basis,wt_basis,'ASSIGNED','UNVERIFIED',jsonb_build_object('transaction_local',true,'transaction_type',upper(p_transaction_type),'part_number',nullif(p_node->>'part_number',''),'sku',nullif(p_node->>'sku',''),'barcode',nullif(p_node->>'barcode',''))) returning id into id_out;
 m:=public.nodara_line_physical_metrics(q,nullif(p_node->>'length','')::numeric,nullif(p_node->>'width','')::numeric,nullif(p_node->>'height','')::numeric,coalesce(nullif(p_node->>'dimension_unit',''),defaults->>'dimension_unit'),nullif(p_node->>'gross_weight','')::numeric,coalesce(nullif(p_node->>'weight_unit',''),defaults->>'weight_unit'),dim_basis,wt_basis);
 update public.cargo_objects set calculated_volume_cbm=nullif(m->>'volume_cbm','')::numeric,calculated_gross_weight_kg=nullif(m->>'gross_weight_kg','')::numeric where id=id_out;
 if jsonb_typeof(p_node->'children')='array' then perform public.nodara_create_transaction_cargo_node(p_org,p_transaction_type,p_transaction_id,ch,id_out) from jsonb_array_elements(p_node->'children') ch; end if; return id_out;
end $function$;
