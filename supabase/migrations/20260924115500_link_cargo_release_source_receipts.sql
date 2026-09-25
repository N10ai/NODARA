create or replace function public.nodara_link_release_to_source_receipts(p_release_id uuid)
returns integer language plpgsql security invoker as $$
declare v_org uuid; v_count integer:=0;
begin
 select organization_id into v_org from public.cargo_releases where id=p_release_id;
 if v_org is null then raise exception 'Cargo Release not found'; end if;
 with src as(
  select wr.id wr_id,sum(crl.requested_quantity) qty,
         case when count(distinct coalesce(crl.uom,cu.uom))=1 then max(coalesce(crl.uom,cu.uom)) else 'MIXED' end uom
  from public.cargo_release_lines crl
  join public.cargo_units cu on cu.id=coalesce(crl.cargo_unit_id,crl.requested_cargo_unit_id)
  join public.warehouse_receipts wr on wr.job_id=cu.job_id and wr.organization_id=v_org
  where crl.cargo_release_id=p_release_id
  group by wr.id
 ), ins as(
  insert into public.operational_links(organization_id,source_type,source_id,target_type,target_id,relationship,metadata,active,updated_at)
  select v_org,'WR',wr_id,'CARGO_RELEASE',p_release_id,'RELEASED_TO',jsonb_build_object('quantity',qty,'uom',uom,'derived_from','cargo_release_lines'),true,now() from src
  on conflict (organization_id,source_type,source_id,target_type,target_id,relationship) where active=true
  do update set metadata=excluded.metadata,updated_at=now()
  returning 1
 )
 select count(*) into v_count from ins; return v_count;
end $$;