-- Warehouse cargo can be allocated to a Cargo Release without requiring an item-master link.
-- inventory_item_id enriches inventory identity; it does not determine whether physical WR cargo is releasable.
create or replace function public.guard_cargo_release_line_allocation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_status text; c cargo_units%rowtype; v_allocated numeric:=0;
begin
 if new.cargo_release_id is null or new.cargo_unit_id is null then raise exception 'Cargo Release line requires a release and cargo unit'; end if;
 if new.requested_quantity is null or new.requested_quantity<=0 then raise exception 'Requested quantity must be greater than zero'; end if;
 select organization_id,status into v_org,v_status from cargo_releases where id=new.cargo_release_id;
 if v_org is null then raise exception 'Cargo Release not found'; end if;
 if not exists(select 1 from organization_members where organization_id=v_org and user_id=auth.uid()) then raise exception 'Not authorized for this Cargo Release'; end if;
 if upper(coalesce(v_status,'')) not in ('DRAFT','ALLOCATED','READY') then raise exception 'Cargo Release status does not allow allocation changes'; end if;
 select * into c from cargo_units where id=new.cargo_unit_id and organization_id=v_org for update;
 if not found then raise exception 'Cargo unit not found in this workspace'; end if;
 if exists(select 1 from cargo_units ch where ch.parent_id=c.id and ch.organization_id=v_org)
    and c.inventory_item_id is null and coalesce(c.quantity,0)<=0 then
   raise exception 'Select the inventory-bearing cargo inside this handling unit';
 end if;
 if coalesce((c.metadata->>'inventory_hold')::boolean,false)=true then raise exception 'Cargo is on hold and cannot be allocated'; end if;
 if upper(coalesce(c.status::text,'')) in ('RELEASED','SHIPPED','DELETED','VOID','CANCELLED') or coalesce(c.quantity,0)<=0 then raise exception 'Cargo unit is not available'; end if;
 select coalesce(sum(l.requested_quantity),0) into v_allocated from cargo_release_lines l join cargo_releases r on r.id=l.cargo_release_id
 where l.cargo_unit_id=new.cargo_unit_id and r.organization_id=v_org and r.status in ('ALLOCATED','READY') and (tg_op='INSERT' or l.id<>old.id);
 if v_allocated+new.requested_quantity>coalesce(c.quantity,0) then raise exception 'Requested quantity exceeds available inventory. On hand: %, already allocated: %, requested: %',c.quantity,v_allocated,new.requested_quantity; end if;
 new.organization_id:=v_org; new.part_number:=coalesce(new.part_number,c.part_number); new.sku:=coalesce(new.sku,c.sku); new.lot_number:=coalesce(new.lot_number,c.lot_number); new.serial_number:=coalesce(new.serial_number,c.serial_number); new.uom:=coalesce(new.uom,c.uom);
 return new;
end $$;