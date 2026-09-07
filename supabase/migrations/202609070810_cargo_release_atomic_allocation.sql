-- Cargo Release allocation is a server-side transaction: header + lines either all persist or none do.
-- Allocation lines are workspace-scoped, inventory-linked, not held, and cannot over-allocate cargo.

create or replace function public.next_cargo_release_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  prefix text;
  next_n integer;
  candidate text;
begin
  if p_organization_id is null then raise exception 'Organization is required'; end if;
  if not exists(
    select 1 from organization_members
    where organization_id=p_organization_id and user_id=auth.uid()
  ) then raise exception 'Not authorized for this workspace'; end if;

  perform pg_advisory_xact_lock(hashtextextended('NODARA_CR:'||p_organization_id::text,0));
  prefix:='CR-'||to_char(current_date,'YYMM')||'-';
  select coalesce(max((regexp_match(release_number,'^'||prefix||'([0-9]+)$'))[1]::integer),0)+1
  into next_n
  from cargo_releases
  where organization_id=p_organization_id and release_number like prefix||'%';
  loop
    candidate:=prefix||lpad(next_n::text,4,'0');
    exit when not exists(select 1 from cargo_releases where organization_id=p_organization_id and release_number=candidate);
    next_n:=next_n+1;
  end loop;
  return candidate;
end;$function$;

create or replace function public.guard_cargo_release_line_allocation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid;
  v_status text;
  c cargo_units%rowtype;
  v_allocated numeric:=0;
begin
  if new.cargo_release_id is null or new.cargo_unit_id is null then
    raise exception 'Cargo Release line requires a release and cargo unit';
  end if;
  if new.requested_quantity is null or new.requested_quantity<=0 then
    raise exception 'Requested quantity must be greater than zero';
  end if;

  select organization_id,status into v_org,v_status
  from cargo_releases
  where id=new.cargo_release_id;
  if v_org is null then raise exception 'Cargo Release not found'; end if;
  if not exists(select 1 from organization_members where organization_id=v_org and user_id=auth.uid()) then
    raise exception 'Not authorized for this Cargo Release';
  end if;
  if upper(coalesce(v_status,'')) not in ('DRAFT','ALLOCATED','READY') then
    raise exception 'Cargo Release status does not allow allocation changes';
  end if;

  select * into c
  from cargo_units
  where id=new.cargo_unit_id and organization_id=v_org
  for update;
  if not found then raise exception 'Cargo unit not found in this workspace'; end if;
  if c.inventory_item_id is null then
    raise exception 'Select an inventory-linked cargo level, not the handling-unit shell';
  end if;
  if coalesce((c.metadata->>'inventory_hold')::boolean,false)=true then
    raise exception 'Cargo is on hold and cannot be allocated';
  end if;
  if upper(coalesce(c.status::text,'')) in ('RELEASED','SHIPPED','DELETED','VOID','CANCELLED') or coalesce(c.quantity,0)<=0 then
    raise exception 'Cargo unit is not available';
  end if;

  select coalesce(sum(l.requested_quantity),0)
  into v_allocated
  from cargo_release_lines l
  join cargo_releases r on r.id=l.cargo_release_id
  where l.cargo_unit_id=new.cargo_unit_id
    and r.organization_id=v_org
    and r.status in ('ALLOCATED','READY')
    and (tg_op='INSERT' or l.id<>old.id);

  if v_allocated+new.requested_quantity>coalesce(c.quantity,0) then
    raise exception 'Requested quantity exceeds available inventory. On hand: %, already allocated: %, requested: %',c.quantity,v_allocated,new.requested_quantity;
  end if;

  new.organization_id:=v_org;
  new.part_number:=coalesce(new.part_number,c.part_number);
  new.sku:=coalesce(new.sku,c.sku);
  new.lot_number:=coalesce(new.lot_number,c.lot_number);
  new.serial_number:=coalesce(new.serial_number,c.serial_number);
  new.uom:=coalesce(new.uom,c.uom);
  return new;
end;$function$;

drop trigger if exists trg_guard_cargo_release_line_allocation on public.cargo_release_lines;
create trigger trg_guard_cargo_release_line_allocation
before insert or update of cargo_release_id,cargo_unit_id,requested_quantity
on public.cargo_release_lines
for each row execute function public.guard_cargo_release_line_allocation();

create or replace function public.create_cargo_release_with_lines(
  p_customer_id uuid default null,
  p_reference text default null,
  p_scheduled_at timestamptz default null,
  p_driver_name text default null,
  p_vehicle_reference text default null,
  p_instructions text default null,
  p_notes text default null,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid;
  v_release_id uuid;
  v_number text;
  l jsonb;
  v_count int:=0;
begin
  select organization_id into v_org
  from organization_members
  where user_id=auth.uid()
  order by created_at limit 1;
  if v_org is null then raise exception 'No workspace found'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'Select at least one cargo line';
  end if;
  if p_customer_id is not null and not exists(select 1 from entities where id=p_customer_id and organization_id=v_org) then
    raise exception 'Customer is not valid for this workspace';
  end if;

  v_number:=next_cargo_release_number(v_org);
  insert into cargo_releases(
    organization_id,release_number,customer_id,reference,status,scheduled_at,
    driver_name,vehicle_reference,instructions,notes,created_by
  ) values(
    v_org,v_number,p_customer_id,nullif(trim(p_reference),''),'ALLOCATED',p_scheduled_at,
    nullif(trim(p_driver_name),''),nullif(trim(p_vehicle_reference),''),nullif(trim(p_instructions),''),nullif(trim(p_notes),''),auth.uid()
  ) returning id into v_release_id;

  for l in select value from jsonb_array_elements(p_lines) loop
    insert into cargo_release_lines(cargo_release_id,cargo_unit_id,requested_quantity,uom)
    values(
      v_release_id,
      nullif(l->>'cargo_unit_id','')::uuid,
      nullif(l->>'requested_quantity','')::numeric,
      nullif(trim(l->>'uom'),'')
    );
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('id',v_release_id,'release_number',v_number,'status','ALLOCATED','line_count',v_count);
end;$function$;
