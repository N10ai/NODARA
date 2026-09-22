alter table public.transport_orders
 add column if not exists route_distance_miles numeric,
 add column if not exists route_duration_minutes integer,
 add column if not exists route_summary text;
