-- Append-only Sellercloud-style pick ledger: every scan/manual pick is an event; picked totals only increase.
create table if not exists public.cargo_release_pick_events(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, cargo_release_id uuid not null references public.cargo_releases(id) on delete cascade,
 cargo_release_line_id uuid not null references public.cargo_release_lines(id) on delete cascade, cargo_unit_id uuid references public.cargo_units(id),
 quantity numeric not null check(quantity>0), method text not null check(method in ('SCAN','MANUAL')), scanned_value text, location_id uuid references public.warehouse_locations(id),
 picked_by uuid default auth.uid(), picked_at timestamptz not null default now(), reversed_at timestamptz, reversed_by uuid, reversal_reason text);
alter table public.cargo_release_pick_events enable row level security;
drop policy if exists cr_pick_events_org on public.cargo_release_pick_events;
create policy cr_pick_events_org on public.cargo_release_pick_events for all using(organization_id in(select organization_id from public.organization_members where user_id=auth.uid())) with check(organization_id in(select organization_id from public.organization_members where user_id=auth.uid()));
create or replace function public.record_cargo_release_pick(p_line_id uuid,p_quantity numeric,p_method text,p_scanned_value text default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare l cargo_release_lines%rowtype;c cargo_units%rowtype;rid uuid;total numeric;
begin if p_quantity<=0 then raise exception 'Pick quantity must be greater than zero';end if;
select * into l from cargo_release_lines where id=p_line_id for update;if not found then raise exception 'Release line not found';end if;
select * into c from cargo_units where id=l.cargo_unit_id;total:=coalesce(l.picked_quantity,0)+p_quantity;
if total>l.requested_quantity then raise exception 'Pick would exceed requested quantity. Remaining: %',l.requested_quantity-coalesce(l.picked_quantity,0);end if;
insert into cargo_release_pick_events(organization_id,cargo_release_id,cargo_release_line_id,cargo_unit_id,quantity,method,scanned_value,location_id) values(l.organization_id,l.cargo_release_id,l.id,l.cargo_unit_id,p_quantity,upper(p_method),p_scanned_value,c.warehouse_location_id) returning id into rid;
update cargo_release_lines set picked_quantity=total,pick_status=case when total=l.requested_quantity then 'PICKED' else 'PARTIAL' end,picked_at=now(),picked_by=auth.uid() where id=l.id;return rid;end $$;
grant execute on function public.record_cargo_release_pick(uuid,numeric,text,text) to authenticated;