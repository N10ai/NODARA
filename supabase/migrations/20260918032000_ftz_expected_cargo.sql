-- Expected cargo is a planning layer, distinct from physically received cargo.
create table if not exists public.ftz_expected_cargo (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, admission_id uuid not null references public.ftz_admissions(id) on delete cascade,
 line_no integer not null, description text, part_number text, package_type text, quantity numeric not null default 0, uom text not null default 'EA',
 gross_weight numeric, weight_unit text, source_document_id uuid, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), created_by uuid default auth.uid(), updated_at timestamptz not null default now(),
 unique(admission_id,line_no)
);
alter table public.ftz_expected_cargo enable row level security;
drop policy if exists ftz_expected_cargo_member on public.ftz_expected_cargo;
create policy ftz_expected_cargo_member on public.ftz_expected_cargo for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

create or replace function public.nodara_add_ftz_expected_cargo(p_admission_id uuid,p_description text,p_quantity numeric,p_uom text,p_package_type text default null,p_part_number text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_id uuid; v_line int;
begin
 select organization_id into v_org from ftz_admissions where id=p_admission_id;
 if v_org is null or not nodara_is_org_member(v_org) then raise exception 'Workspace access denied'; end if;
 select coalesce(max(line_no),0)+1 into v_line from ftz_expected_cargo where admission_id=p_admission_id;
 insert into ftz_expected_cargo(organization_id,admission_id,line_no,description,quantity,uom,package_type,part_number)
 values(v_org,p_admission_id,v_line,nullif(btrim(p_description),''),greatest(coalesce(p_quantity,0),0),upper(coalesce(nullif(btrim(p_uom),''),'EA')),nullif(upper(btrim(p_package_type)),''),nullif(btrim(p_part_number),''))
 returning id into v_id;
 perform nodara_ftz_record_event(p_admission_id,'EXPECTED_CARGO_ADDED','Expected cargo added',coalesce(p_description,'Cargo')||' · '||p_quantity||' '||coalesce(p_uom,'EA'),'EXPECTED_CARGO',v_id,'{}');
 return v_id;
end $$;
revoke execute on function public.nodara_add_ftz_expected_cargo(uuid,text,numeric,text,text,text) from public,anon;
grant execute on function public.nodara_add_ftz_expected_cargo(uuid,text,numeric,text,text,text) to authenticated;