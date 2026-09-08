create or replace function public.nodara_enrich_cargo_evidence_document()
returns trigger language plpgsql set search_path=public as $$
declare c public.cargo_units%rowtype;
begin
 if upper(coalesce(new.category,''))='PHOTO' and new.cargo_object_id is not null then
  select * into c from public.cargo_units where cargo_object_id=new.cargo_object_id and organization_id=new.organization_id order by created_at desc limit 1;
  if c.id is not null then
   new.metadata=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
    'evidence_snapshot',jsonb_build_object(
      'cargo_unit_id',c.id,
      'handling_unit_code',c.handling_unit_code,
      'uin',c.uin,
      'gross_weight_lb',c.weight_lb,
      'length_in',c.length_in,
      'width_in',c.width_in,
      'height_in',c.height_in,
      'warehouse_location_id',coalesce(c.warehouse_location_id,c.current_location_id),
      'captured_at',now()
    )
   );
  end if;
 end if;
 return new;
end $$;
drop trigger if exists trg_nodara_enrich_cargo_evidence_document on public.documents;
create trigger trg_nodara_enrich_cargo_evidence_document before insert on public.documents for each row execute function public.nodara_enrich_cargo_evidence_document();
