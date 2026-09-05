-- Keep current operational tables synchronized while NODARA transitions to canonical cargo objects.

create or replace function public.nodara_sync_cargo_unit_object()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  j jsonb:=to_jsonb(new);
  v_org uuid:=nullif(j->>'organization_id','')::uuid;
  v_source uuid:=nullif(coalesce(j->>'warehouse_receipt_id',j->>'receipt_id'),'')::uuid;
  v_parent uuid:=nullif(coalesce(j->>'parent_id',j->>'parent_cargo_id'),'')::uuid;
begin
  new.cargo_object_id:=new.id;
  insert into public.cargo_objects(id,organization_id,cargo_code,source_type,source_id,parent_cargo_id,package_type,quantity,uom,description,gross_weight,weight_unit,length,width,height,dimension_unit,volume_cbm,status,metadata,updated_at)
  values(
    new.id,v_org,
    coalesce(j->>'uin',j->>'cargo_code',j->>'handling_unit_code',j->>'handling_unit_id'),
    case when v_source is null then 'DIRECT' else 'WAREHOUSE_RECEIPT' end,
    v_source,
    case when v_parent is not null and exists(select 1 from public.cargo_objects where id=v_parent) then v_parent else null end,
    coalesce(j->>'package_type',j->>'type'),
    coalesce(nullif(j->>'quantity','')::numeric,1),
    coalesce(j->>'uom',j->>'unit'),
    coalesce(j->>'description',j->>'commodity'),
    nullif(coalesce(j->>'gross_weight',j->>'weight'),'')::numeric,
    coalesce(j->>'weight_unit','LB'),
    nullif(j->>'length','')::numeric,nullif(j->>'width','')::numeric,nullif(j->>'height','')::numeric,
    coalesce(j->>'dimension_unit','IN'),nullif(j->>'volume_cbm','')::numeric,
    coalesce(j->>'status','AVAILABLE'),jsonb_build_object('legacy_cargo_unit_id',new.id),now()
  )
  on conflict(id) do update set
    cargo_code=excluded.cargo_code,source_type=excluded.source_type,source_id=excluded.source_id,
    parent_cargo_id=coalesce(excluded.parent_cargo_id,cargo_objects.parent_cargo_id),package_type=excluded.package_type,
    quantity=excluded.quantity,uom=excluded.uom,description=excluded.description,gross_weight=excluded.gross_weight,
    weight_unit=excluded.weight_unit,length=excluded.length,width=excluded.width,height=excluded.height,
    dimension_unit=excluded.dimension_unit,volume_cbm=excluded.volume_cbm,status=excluded.status,updated_at=now();
  return new;
end $$;

drop trigger if exists trg_nodara_sync_cargo_unit_object on public.cargo_units;
create trigger trg_nodara_sync_cargo_unit_object
before insert or update on public.cargo_units
for each row execute function public.nodara_sync_cargo_unit_object();

create or replace function public.nodara_sync_wr_cargo_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
declare j jsonb:=to_jsonb(new); v_org uuid:=nullif(j->>'organization_id','')::uuid; v_wr uuid:=nullif(coalesce(j->>'warehouse_receipt_id',j->>'receipt_id'),'')::uuid;
begin
  if v_org is not null and v_wr is not null then
    insert into public.cargo_assignments(organization_id,cargo_object_id,transaction_type,transaction_id,assignment_role,status)
    values(v_org,new.id,'WAREHOUSE_RECEIPT',v_wr,'SOURCE','ASSIGNED') on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_nodara_sync_wr_cargo_assignment on public.cargo_units;
create trigger trg_nodara_sync_wr_cargo_assignment
after insert or update on public.cargo_units
for each row execute function public.nodara_sync_wr_cargo_assignment();

-- Existing CR allocation lines also become canonical transaction assignments.
create or replace function public.nodara_sync_cr_cargo_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_obj uuid; v_org uuid;
begin
  select coalesce(cargo_object_id,id),organization_id into v_obj,v_org from public.cargo_units where id=new.cargo_unit_id;
  if v_obj is not null then
    insert into public.cargo_assignments(organization_id,cargo_object_id,transaction_type,transaction_id,assignment_role,planned_quantity,status,metadata)
    values(v_org,v_obj,'CARGO_RELEASE',new.cargo_release_id,'CARGO',new.requested_quantity,'ASSIGNED',jsonb_build_object('cargo_release_line_id',new.id))
    on conflict(cargo_object_id,transaction_type,transaction_id,assignment_role) do update set planned_quantity=excluded.planned_quantity,status='ASSIGNED',updated_at=now();
  end if;
  return new;
end $$;
drop trigger if exists trg_nodara_sync_cr_cargo_assignment on public.cargo_release_lines;
create trigger trg_nodara_sync_cr_cargo_assignment
after insert or update on public.cargo_release_lines
for each row execute function public.nodara_sync_cr_cargo_assignment();

insert into public.cargo_assignments(organization_id,cargo_object_id,transaction_type,transaction_id,assignment_role,planned_quantity,status,metadata)
select cu.organization_id,coalesce(cu.cargo_object_id,cu.id),'CARGO_RELEASE',l.cargo_release_id,'CARGO',l.requested_quantity,'ASSIGNED',jsonb_build_object('cargo_release_line_id',l.id)
from public.cargo_release_lines l join public.cargo_units cu on cu.id=l.cargo_unit_id
on conflict(cargo_object_id,transaction_type,transaction_id,assignment_role) do update set planned_quantity=excluded.planned_quantity,status='ASSIGNED';

notify pgrst,'reload schema';