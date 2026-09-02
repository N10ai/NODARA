create table if not exists public.cargo_releases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  release_number text not null,
  customer_id uuid references public.entities(id) on delete set null,
  consignee_id uuid references public.entities(id) on delete set null,
  carrier_id uuid references public.entities(id) on delete set null,
  reference text,
  status text not null default 'DRAFT',
  scheduled_at timestamptz,
  driver_name text,
  vehicle_reference text,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique(organization_id, release_number)
);

create table if not exists public.cargo_release_lines (
  id uuid primary key default gen_random_uuid(),
  cargo_release_id uuid not null references public.cargo_releases(id) on delete cascade,
  cargo_unit_id uuid not null references public.cargo_units(id) on delete restrict,
  requested_quantity numeric not null check(requested_quantity > 0),
  uom text,
  created_at timestamptz not null default now(),
  unique(cargo_release_id,cargo_unit_id)
);

create index if not exists cargo_releases_org_status_idx on public.cargo_releases(organization_id,status);
create index if not exists cargo_release_lines_release_idx on public.cargo_release_lines(cargo_release_id);
create index if not exists cargo_release_lines_cargo_idx on public.cargo_release_lines(cargo_unit_id);

alter table public.cargo_releases enable row level security;
alter table public.cargo_release_lines enable row level security;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='cargo_releases' and policyname='cargo_releases_authenticated') then
    create policy cargo_releases_authenticated on public.cargo_releases for all to authenticated using(true) with check(true);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='cargo_release_lines' and policyname='cargo_release_lines_authenticated') then
    create policy cargo_release_lines_authenticated on public.cargo_release_lines for all to authenticated using(true) with check(true);
  end if;
end $$;

create or replace function public.next_cargo_release_number(p_organization_id uuid)
returns text language plpgsql security definer as $$
declare n integer;
begin
  select coalesce(max(nullif(regexp_replace(release_number,'[^0-9]','','g'),'')::integer),0)+1 into n
  from public.cargo_releases where organization_id=p_organization_id;
  return 'CR-'||to_char(now(),'YYMM')||'-'||lpad(n::text,4,'0');
end $$;

create or replace function public.confirm_cargo_release(p_release_id uuid)
returns jsonb language plpgsql security definer as $$
declare l record; c record; remaining numeric;
begin
  if exists(select 1 from public.cargo_releases where id=p_release_id and status='RELEASED') then raise exception 'Cargo release is already confirmed'; end if;
  for l in select * from public.cargo_release_lines where cargo_release_id=p_release_id loop
    select id,quantity,status into c from public.cargo_units where id=l.cargo_unit_id for update;
    if c.id is null then raise exception 'Cargo unit not found'; end if;
    if upper(coalesce(c.status,'')) in ('RELEASED','SHIPPED','DELETED','VOID','CANCELLED') then raise exception 'Cargo unit is not available'; end if;
    if l.requested_quantity > coalesce(c.quantity,0) then raise exception 'Requested quantity exceeds available cargo'; end if;
    remaining:=c.quantity-l.requested_quantity;
    if remaining=0 then update public.cargo_units set quantity=0,status='RELEASED',warehouse_location_id=null where id=c.id;
    else update public.cargo_units set quantity=remaining where id=c.id; end if;
  end loop;
  update public.cargo_releases set status='RELEASED',confirmed_at=now(),updated_at=now() where id=p_release_id;
  return jsonb_build_object('id',p_release_id,'status','RELEASED');
end $$;
