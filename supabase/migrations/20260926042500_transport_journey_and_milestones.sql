create or replace function public.nodara_sync_to_journey_on_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.nodara_link_transport_order_sources(new.transport_order_id); return new; end; $$;
drop trigger if exists nodara_to_cargo_journey_write on public.transport_order_cargo;
create trigger nodara_to_cargo_journey_write after insert or update on public.transport_order_cargo for each row execute function public.nodara_sync_to_journey_on_write();

create or replace function public.nodara_sync_to_journey_on_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.nodara_link_transport_order_sources(old.transport_order_id); return old; end; $$;
drop trigger if exists nodara_to_cargo_journey_delete on public.transport_order_cargo;
create trigger nodara_to_cargo_journey_delete after delete on public.transport_order_cargo for each row execute function public.nodara_sync_to_journey_on_delete();

create or replace function public.nodara_set_transport_milestone(p_transport_order_id uuid,p_milestone text)
returns public.transport_orders language plpgsql security invoker set search_path=public as $$
declare v public.transport_orders; m text:=upper(trim(p_milestone));
begin
 if m='DISPATCHED' then update transport_orders set status='DISPATCHED',updated_at=now() where id=p_transport_order_id returning * into v;
 elsif m in ('PICKED_UP','IN_TRANSIT') then update transport_orders set status='IN_TRANSIT',actual_pickup_at=coalesce(actual_pickup_at,now()),updated_at=now() where id=p_transport_order_id returning * into v;
 elsif m='DELIVERED' then update transport_orders set status='DELIVERED',actual_pickup_at=coalesce(actual_pickup_at,now()),actual_delivery_at=coalesce(actual_delivery_at,now()),updated_at=now() where id=p_transport_order_id returning * into v;
 else raise exception 'Unsupported transport milestone'; end if;
 if v.id is null then raise exception 'Transport Order not found'; end if; return v;
end; $$;
grant execute on function public.nodara_set_transport_milestone(uuid,text) to authenticated;
