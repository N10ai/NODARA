alter table public.cargo_release_lines add column if not exists picked_quantity numeric not null default 0;
alter table public.cargo_release_lines add column if not exists pick_status text not null default 'PENDING';
alter table public.cargo_release_lines add column if not exists pick_exception text;
alter table public.cargo_release_lines add column if not exists picked_at timestamptz;
alter table public.cargo_release_lines add column if not exists picked_by uuid;

alter table public.cargo_releases add column if not exists driver_company text;
alter table public.cargo_releases add column if not exists license_plate text;
alter table public.cargo_releases add column if not exists trailer_reference text;
alter table public.cargo_releases add column if not exists release_checked_at timestamptz;
alter table public.cargo_releases add column if not exists released_by uuid;

create table if not exists public.cargo_release_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cargo_release_id uuid not null references public.cargo_releases(id) on delete cascade,
  cargo_release_line_id uuid references public.cargo_release_lines(id) on delete cascade,
  evidence_type text not null,
  file_path text,
  file_name text,
  mime_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists cargo_release_evidence_release_idx on public.cargo_release_evidence(cargo_release_id,created_at desc);
alter table public.cargo_release_evidence enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='cargo_release_evidence' and policyname='cargo_release_evidence_authenticated') then
    create policy cargo_release_evidence_authenticated on public.cargo_release_evidence for all to authenticated using(true) with check(true);
  end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nodara-evidence','nodara-evidence',false,15728640,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='nodara_evidence_read') then
    create policy nodara_evidence_read on storage.objects for select to authenticated using(bucket_id='nodara-evidence');
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='nodara_evidence_insert') then
    create policy nodara_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='nodara-evidence');
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='nodara_evidence_update') then
    create policy nodara_evidence_update on storage.objects for update to authenticated using(bucket_id='nodara-evidence') with check(bucket_id='nodara-evidence');
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='nodara_evidence_delete') then
    create policy nodara_evidence_delete on storage.objects for delete to authenticated using(bucket_id='nodara-evidence');
  end if;
end $$;

create or replace function public.cr_pick_scan(p_release_id uuid,p_scan text,p_quantity numeric default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare l record; c record; q numeric; complete boolean;
begin
  select crl.*,cu.uin,cu.handling_unit_code,cu.part_number,cu.sku,cu.quantity available_qty
  into l
  from public.cargo_release_lines crl join public.cargo_units cu on cu.id=crl.cargo_unit_id
  where crl.cargo_release_id=p_release_id
    and lower(trim(p_scan)) in (lower(coalesce(cu.uin,'')),lower(coalesce(cu.handling_unit_code,'')),lower(coalesce(cu.part_number,'')),lower(coalesce(cu.sku,'')),lower(cu.id::text))
  order by case when crl.pick_status='COMPLETE' then 1 else 0 end
  limit 1 for update of crl;
  if l.id is null then raise exception 'Scanned cargo is not allocated to this Cargo Release'; end if;
  q:=coalesce(p_quantity,l.requested_quantity-l.picked_quantity);
  if q<=0 then raise exception 'Nothing remaining to pick on this line'; end if;
  if l.picked_quantity+q>l.requested_quantity then raise exception 'Picked quantity exceeds requested quantity'; end if;
  update public.cargo_release_lines set picked_quantity=picked_quantity+q,pick_status=case when picked_quantity+q>=requested_quantity then 'COMPLETE' else 'PARTIAL' end,pick_exception=null,picked_at=now(),picked_by=auth.uid() where id=l.id;
  update public.cargo_releases set status='PICKING',updated_at=now() where id=p_release_id and status='ALLOCATED';
  select not exists(select 1 from public.cargo_release_lines where cargo_release_id=p_release_id and picked_quantity<requested_quantity) into complete;
  if complete then update public.cargo_releases set status='READY',updated_at=now() where id=p_release_id; end if;
  return jsonb_build_object('line_id',l.id,'picked_quantity',l.picked_quantity+q,'requested_quantity',l.requested_quantity,'all_complete',complete);
end $$;

create or replace function public.cr_pick_exception(p_line_id uuid,p_exception text)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.cargo_release_lines set pick_status='EXCEPTION',pick_exception=p_exception,picked_at=now(),picked_by=auth.uid() where id=p_line_id;
 update public.cargo_releases set status='PICKING',updated_at=now() where id=(select cargo_release_id from public.cargo_release_lines where id=p_line_id) and status='ALLOCATED';
end $$;
