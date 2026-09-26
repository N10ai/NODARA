-- Air booking is an independent shipment workstream; AWB stock allocation can be layered onto carrier records later.
create table if not exists public.shipment_air_bookings(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 shipment_id uuid not null references public.shipments(id) on delete cascade,
 carrier_id uuid, carrier_name text, booking_reference text, mawb_number text,
 awb_prefix text, awb_serial text, flight_number text, origin_code text, destination_code text,
 etd timestamptz, eta timestamptz, routing_legs jsonb not null default '[]'::jsonb,
 status text not null default 'DRAFT' check(status in ('DRAFT','REQUESTED','CONFIRMED','CANCELLED')),
 source text not null default 'MANUAL',
 awb_stock_allocation_id uuid,
 metadata jsonb not null default '{}'::jsonb,
 created_by uuid default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(shipment_id)
);
alter table public.shipment_air_bookings enable row level security;
drop policy if exists shipment_air_bookings_org on public.shipment_air_bookings;
create policy shipment_air_bookings_org on public.shipment_air_bookings for all
 using(organization_id in(select organization_id from public.organization_members where user_id=auth.uid()))
 with check(organization_id in(select organization_id from public.organization_members where user_id=auth.uid()));
create index if not exists shipment_air_bookings_mawb_idx on public.shipment_air_bookings(organization_id,mawb_number);

create or replace function public.nodara_save_air_booking(p_shipment_id uuid,p_data jsonb)
returns public.shipment_air_bookings language plpgsql security invoker set search_path=public as $$
declare s shipments; b shipment_air_bookings; mawb text;
begin
 select * into s from shipments where id=p_shipment_id;if s.id is null then raise exception 'Shipment not found';end if;
 mawb=nullif(regexp_replace(coalesce(p_data->>'mawb_number',''),'[^0-9]','','g'),'');
 if length(mawb)=11 then mawb=substr(mawb,1,3)||'-'||substr(mawb,4); elsif mawb='' then mawb=null; end if;
 insert into shipment_air_bookings(organization_id,shipment_id,carrier_id,carrier_name,booking_reference,mawb_number,awb_prefix,awb_serial,flight_number,origin_code,destination_code,etd,eta,routing_legs,status,source,metadata)
 values(s.organization_id,s.id,nullif(p_data->>'carrier_id','')::uuid,nullif(p_data->>'carrier_name',''),nullif(p_data->>'booking_reference',''),mawb,
 case when mawb is not null then substr(replace(mawb,'-',''),1,3) end,case when mawb is not null then substr(replace(mawb,'-',''),4) end,
 nullif(p_data->>'flight_number',''),coalesce(nullif(p_data->>'origin_code',''),s.origin_code),coalesce(nullif(p_data->>'destination_code',''),s.destination_code),
 nullif(p_data->>'etd','')::timestamptz,nullif(p_data->>'eta','')::timestamptz,coalesce(p_data->'routing_legs','[]'::jsonb),coalesce(nullif(p_data->>'status',''),'CONFIRMED'),'MANUAL',jsonb_build_object('future_awb_stock_ready',true))
 on conflict(shipment_id) do update set carrier_id=excluded.carrier_id,carrier_name=excluded.carrier_name,booking_reference=excluded.booking_reference,mawb_number=excluded.mawb_number,awb_prefix=excluded.awb_prefix,awb_serial=excluded.awb_serial,flight_number=excluded.flight_number,origin_code=excluded.origin_code,destination_code=excluded.destination_code,etd=excluded.etd,eta=excluded.eta,routing_legs=excluded.routing_legs,status=excluded.status,updated_at=now()
 returning * into b;
 update shipments set carrier_id=coalesce(b.carrier_id,carrier_id),booking_reference=b.booking_reference,master_reference=coalesce(b.mawb_number,master_reference),origin_code=coalesce(b.origin_code,origin_code),destination_code=coalesce(b.destination_code,destination_code),etd=coalesce(b.etd,etd),eta=coalesce(b.eta,eta),status=case when b.status='CONFIRMED' and status in('DRAFT','PLANNED') then 'BOOKED' else status end,updated_at=now() where id=s.id;
 return b;
end $$;
revoke all on function public.nodara_save_air_booking(uuid,jsonb) from public,anon;
grant execute on function public.nodara_save_air_booking(uuid,jsonb) to authenticated;
