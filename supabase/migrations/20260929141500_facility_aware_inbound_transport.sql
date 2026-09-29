-- Facility-aware inbound routing for multitenant transport orders.
alter table public.transport_orders add column if not exists pickup_facility_id uuid references public.organization_facilities(id) on delete set null;
alter table public.transport_orders add column if not exists delivery_facility_id uuid references public.organization_facilities(id) on delete set null;
create index if not exists transport_orders_delivery_facility_idx on public.transport_orders(organization_id,delivery_facility_id,status);

create or replace function public.nodara_guard_transport_facility() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied';end if;
 if new.pickup_facility_id is not null and not exists(select 1 from organization_facilities f where f.id=new.pickup_facility_id and f.organization_id=new.organization_id and f.is_active) then raise exception 'Pickup facility workspace mismatch';end if;
 if new.delivery_facility_id is not null and not exists(select 1 from organization_facilities f where f.id=new.delivery_facility_id and f.organization_id=new.organization_id and f.is_active) then raise exception 'Delivery facility workspace mismatch';end if;
 return new;
end $$;
drop trigger if exists nodara_transport_facility_guard on public.transport_orders;
create trigger nodara_transport_facility_guard before insert or update of organization_id,pickup_facility_id,delivery_facility_id on public.transport_orders for each row execute function public.nodara_guard_transport_facility();

create or replace function public.nodara_match_org_facility(p_organization_id uuid,p_address text)
returns uuid language plpgsql stable security invoker set search_path=public as $$
declare a text:=regexp_replace(lower(coalesce(p_address,'')),'[^a-z0-9]','','g');r uuid;
begin
 if not nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied';end if;
 if a='' then return null;end if;
 select id into r from organization_facilities f where f.organization_id=p_organization_id and f.is_active
 and length(regexp_replace(lower(coalesce(f.line1,'')),'[^a-z0-9]','','g'))>5
 and a like '%'||regexp_replace(lower(f.line1),'[^a-z0-9]','','g')||'%'
 order by is_default_warehouse desc limit 1;return r;
end $$;

create or replace function public.nodara_incoming_transport_orders(p_organization_id uuid)
returns table(transport_order_id uuid,order_number text,customer_id uuid,customer_name text,status text,scheduled_arrival timestamptz,actual_delivery_at timestamptz,pieces numeric,weight numeric,weight_unit text,carrier_id uuid,carrier_name text,delivery_name text,delivery_address text,received_quantity numeric,receiving_state text)
language sql stable security invoker set search_path=public as $$
 with x as(select t.*,coalesce(t.delivery_facility_id,nodara_match_org_facility(t.organization_id,t.delivery_address)) matched_facility from transport_orders t where t.organization_id=p_organization_id)
 select t.id,t.order_number,t.customer_id,c.name,t.status,t.scheduled_end,t.actual_delivery_at,t.pieces,t.weight,t.weight_unit,t.carrier_id,car.name,t.delivery_name,t.delivery_address,
 coalesce((select sum(coalesce(l.received_quantity,0)) from transport_receiving_links l where l.transport_order_id=t.id and l.status<>'CANCELLED'),0),
 case when exists(select 1 from transport_receiving_links l where l.transport_order_id=t.id and l.status='RECEIVING') then 'RECEIVING'
 when exists(select 1 from transport_receiving_links l where l.transport_order_id=t.id and l.status='PARTIAL') then 'PARTIAL'
 when t.actual_delivery_at is not null or upper(coalesce(t.status,'')) in ('DELIVERED','COMPLETED') then 'AT_WAREHOUSE' else 'INCOMING' end
 from x t join organization_facilities f on f.id=t.matched_facility and f.organization_id=t.organization_id and f.is_active
 left join entities c on c.id=t.customer_id and c.organization_id=t.organization_id left join entities car on car.id=t.carrier_id and car.organization_id=t.organization_id
 where f.facility_type='WAREHOUSE' and upper(coalesce(t.status,''))<>'CANCELLED'
 and not(coalesce(t.pieces,0)>0 and coalesce(t.pieces,0)<=coalesce((select sum(coalesce(l.received_quantity,0)) from transport_receiving_links l where l.transport_order_id=t.id and l.status='RECEIVED'),0))
 order by case when t.actual_delivery_at is not null then 0 else 1 end,t.scheduled_end nulls last,t.created_at;
$$;
revoke execute on function public.nodara_match_org_facility(uuid,text) from public,anon;grant execute on function public.nodara_match_org_facility(uuid,text) to authenticated;
notify pgrst,'reload schema';