begin;
alter table public.operations_requests add column if not exists deleted_at timestamptz;
alter table public.operations_requests add column if not exists deleted_status text check(deleted_status in ('NEW','WORKING','WAITING','READY_TO_BILL','COMPLETED','CANCELLED'));
alter table public.operations_requests add constraint operations_requests_deleted_inactive check (deleted_at is null or status='CANCELLED');
create index if not exists operations_requests_trash on public.operations_requests(organization_id,deleted_at) where deleted_at is not null;
notify pgrst,'reload schema';
commit;
