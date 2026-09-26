-- Canonical read-only transport reference catalog. Initial seed derived from OurAirports and UN/LOCODE; live project migration contains the initial common-gateway seed.
create table if not exists public.transport_locations (
 id uuid primary key default gen_random_uuid(), location_type text not null check (location_type in ('AIRPORT','SEAPORT','INLAND_PORT','RAIL','OTHER')), name text not null, city text, subdivision text, country_code text not null, iata_code text, icao_code text, unlocode text, latitude numeric, longitude numeric, aliases text[] not null default '{}', source text not null, source_version text, priority integer not null default 0, active boolean not null default true, search_text text not null default '', created_at timestamptz not null default now());
create unique index if not exists transport_locations_iata_uidx on public.transport_locations(iata_code) where iata_code is not null and location_type='AIRPORT';
create unique index if not exists transport_locations_unlocode_type_uidx on public.transport_locations(unlocode,location_type) where unlocode is not null;
create index if not exists transport_locations_search_idx on public.transport_locations using gin (to_tsvector('simple',search_text));
alter table public.transport_locations enable row level security;
revoke all on table public.transport_locations from anon, authenticated;
grant select on table public.transport_locations to authenticated;
drop policy if exists "Authenticated users can read transport locations" on public.transport_locations;
create policy "Authenticated users can read transport locations" on public.transport_locations for select to authenticated using (active=true);
