create table if not exists public.cargo_releases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  release_number text,
  customer_id uuid,
  consignee_id uuid,
  carrier_id uuid,
  reference text,
  status text not null default 'DRAFT',
  scheduled_at timestamptz,
  driver_name text,
  vehicle_reference text,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

alter table public.cargo_releases add column if not exists organization_id uuid;
alter table public.cargo_releases add column if not exists release_number text;
alter table public.cargo_releases add column if not exists customer_id uuid;
alter table public.cargo_releases add column if not exists consignee_id uuid;
alter table public.cargo_releases add column if not exists carrier_id uuid;
alter table public.cargo_releases add column if not exists reference text;
alter table public.cargo_releases add column if not exists status text default 'DRAFT';
alter table public.cargo_releases add column if not exists scheduled_at timestamptz;
alter table public.cargo_releases add column if not exists driver_name text;
alter table public.cargo_releases add column if not exists vehicle_reference text;
alter table public.cargo_releases add column if not exists instructions text;
alter table public.cargo_releases add column if not exists created_at timestamptz default now();
alter table public.cargo_releases add column if not exists updated_at timestamptz default now();
alter table public.cargo_releases add column if not exists confirmed_at timestamptz;

create table if not exists public.cargo_release_lines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.cargo_release_lines add column if not exists cargo_release_id uuid;
alter table public.cargo_release_lines add column if not exists cargo_unit_id uuid;
alter table public.cargo_release_lines add column if not exists requested_quantity numeric;
alter table public.cargo_release_lines add column if not exists uom text;
alter table public.cargo_release_lines add column if not exists created_at timestamptz default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname='cargo_releases_customer_id_fkey') then
    alter table public.cargo_releases add constraint cargo_releases_customer_id_fkey foreign key(customer_id) references public.entities(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='cargo_releases_consignee_id_fkey') then
    alter table public.cargo_releases add constraint cargo_releases_consignee_id_fkey foreign key(consignee_id) references public.entities(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='cargo_releases_carrier_id_fkey') then
    alter table public.cargo_releases add constraint cargo_releases_carrier_id_fkey foreign key(carrier_id) references public.entities(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='cargo_release_lines_release_fkey') then
    alter table public.cargo_release_lines add constraint cargo_release_lines_release_fkey foreign key(cargo_release_id) references public.cargo_releases(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='cargo_release_lines_cargo_fkey') then
    alter table public.cargo_release_lines add constraint cargo_release_lines_cargo_fkey foreign key(cargo_unit_id) references public.cargo_units(id) on delete restrict;
  end if;
end $$;

create unique index if not exists cargo_releases_org_number_uidx on public.cargo_releases(organization_id,release_number) where release_number is not null;
create unique index if not exists cargo_release_lines_release_cargo_uidx on public.cargo_release_lines(cargo_release_id,cargo_unit_id) where cargo_release_id is not null and cargo_unit_id is not null;
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
  if not exists(select 1 from public.cargo_release_lines where cargo_release_id=p_release_id) then raise exception 'Cargo release has no lines'; end if;
  for l in select * from public.cargo_release_lines where cargo_release_id=p_release_id loop
    if l.cargo_unit_id is null then raise exception 'Cargo release line is missing cargo unit'; end if;
    if l.requested_quantity is null or l.requested_quantity<=0 then raise exception 'Cargo release line has invalid quantity'; end if;
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
