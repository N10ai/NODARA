begin;
alter table public.operations_messages add column deleted_at timestamptz;
alter table public.operations_requests drop constraint operations_requests_request_type_check;
alter table public.operations_requests add constraint operations_requests_request_type_check check(request_type in ('PICKUP','DELIVERY','TRANSFER','DRAYAGE','SHIPMENT_AIR','SHIPMENT_OCEAN','SHIPMENT_GROUND','DOCUMENTATION','INVENTORY_CHECK','COMPLAINT','COMPLIANCE','OTHER','WAREHOUSE_RECEIVING','WAREHOUSE_RELEASE','PICK_PACK','LABELING','REPACKING','PALLETIZING','CROSS_DOCK','CARGO_PHOTOS','CARGO_MEASUREMENTS','CONTAINER_LOADING','CONTAINER_UNLOADING','STORAGE','CYCLE_COUNT','WAREHOUSE_OTHER'));
create table public.operations_request_notes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 request_id uuid not null references public.operations_requests(id), body text not null check(length(btrim(body)) between 1 and 10000),
 created_by uuid not null default auth.uid(), created_at timestamptz not null default now()
);
create index on public.operations_request_notes(organization_id,request_id,created_at);
alter table public.operations_request_notes enable row level security;
create policy request_notes_read on public.operations_request_notes for select to authenticated using(public.nodara_is_org_member(organization_id));
create policy request_notes_insert on public.operations_request_notes for insert to authenticated with check(public.nodara_is_org_member(organization_id) and created_by=(select auth.uid()) and exists(select 1 from public.operations_requests r where r.id=request_id and r.organization_id=operations_request_notes.organization_id));
grant select,insert on public.operations_request_notes to authenticated;
create table public.operations_request_transactions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), request_id uuid not null references public.operations_requests(id),
 transport_order_id uuid references public.transport_orders(id), shipment_id uuid references public.shipments(id),
 warehouse_receipt_id uuid references public.warehouse_receipts(id), cargo_release_id uuid references public.cargo_releases(id),
 created_at timestamptz not null default now(), created_by uuid default auth.uid(),
 check(num_nonnulls(transport_order_id,shipment_id,warehouse_receipt_id,cargo_release_id)=1)
);
create unique index on public.operations_request_transactions(request_id,transport_order_id) where transport_order_id is not null;
create unique index on public.operations_request_transactions(request_id,shipment_id) where shipment_id is not null;
create unique index on public.operations_request_transactions(request_id,warehouse_receipt_id) where warehouse_receipt_id is not null;
create unique index on public.operations_request_transactions(request_id,cargo_release_id) where cargo_release_id is not null;
create index on public.operations_request_transactions(organization_id,request_id);
alter table public.operations_request_transactions enable row level security;
create policy request_transactions_read on public.operations_request_transactions for select to authenticated using(public.nodara_is_org_member(organization_id));
create policy request_transactions_insert on public.operations_request_transactions for insert to authenticated with check(public.nodara_is_org_member(organization_id));
grant select,insert on public.operations_request_transactions to authenticated;
create function public.nodara_guard_request_transaction() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from public.operations_requests where id=new.request_id and organization_id=new.organization_id) then raise exception 'Request must belong to this workspace'; end if;
 if new.transport_order_id is not null and not exists(select 1 from public.transport_orders where id=new.transport_order_id and organization_id=new.organization_id) then raise exception 'Invalid transport order link'; end if;
 if new.shipment_id is not null and not exists(select 1 from public.shipments where id=new.shipment_id and organization_id=new.organization_id) then raise exception 'Invalid shipment link'; end if;
 if new.warehouse_receipt_id is not null and not exists(select 1 from public.warehouse_receipts where id=new.warehouse_receipt_id and organization_id=new.organization_id) then raise exception 'Invalid warehouse receipt link'; end if;
 if new.cargo_release_id is not null and not exists(select 1 from public.cargo_releases where id=new.cargo_release_id and organization_id=new.organization_id) then raise exception 'Invalid cargo release link'; end if;
 new.created_at:=now(); new.created_by:=auth.uid(); return new;
end $$;
revoke all on function public.nodara_guard_request_transaction() from public,anon,authenticated;
create trigger guard_request_transaction before insert on public.operations_request_transactions for each row execute function public.nodara_guard_request_transaction();
notify pgrst,'reload schema';
commit;
