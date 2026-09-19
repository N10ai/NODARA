create table if not exists public.ftz_dispositions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,inventory_identity_id uuid not null references public.ftz_inventory_identities(id),
 admission_id uuid references public.ftz_admissions(id),disposition_number text not null,disposition_type text not null,status text not null default 'DRAFT',
 destination text,reference_number text,notes text,posted_at timestamptz,voided_at timestamptz,metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),created_by uuid default auth.uid(),updated_at timestamptz not null default now(),unique(organization_id,disposition_number));
create table if not exists public.ftz_disposition_lines(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,disposition_id uuid not null references public.ftz_dispositions(id) on delete cascade,
 cargo_object_id uuid not null references public.cargo_objects(id),quantity numeric not null check(quantity>0),uom text not null,created_at timestamptz not null default now(),created_by uuid default auth.uid());
alter table public.ftz_dispositions enable row level security;alter table public.ftz_disposition_lines enable row level security;
create policy ftz_dispositions_member on public.ftz_dispositions for all to authenticated using(nodara_is_org_member(organization_id)) with check(nodara_is_org_member(organization_id));
create policy ftz_disposition_lines_member on public.ftz_disposition_lines for all to authenticated using(nodara_is_org_member(organization_id)) with check(nodara_is_org_member(organization_id));

create or replace function public.nodara_create_ftz_disposition(p_inventory_identity_id uuid,p_type text,p_destination text default null,p_reference_number text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_adm uuid;v_id uuid;v_num text;v_type text;
begin
 select organization_id,admission_id into v_org,v_adm from ftz_inventory_identities where id=p_inventory_identity_id and status='ACTIVE';
 if v_org is null or not nodara_is_org_member(v_org) then raise exception 'Active inventory identity not found or access denied';end if;
 v_type:=upper(btrim(p_type));if v_type not in ('CONSUMPTION_ENTRY','TRANSFER','EXPORT','DESTRUCTION','OTHER') then raise exception 'Unsupported disposition type';end if;
 v_num:='DSP-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into ftz_dispositions(organization_id,inventory_identity_id,admission_id,disposition_number,disposition_type,destination,reference_number,notes)
 values(v_org,p_inventory_identity_id,v_adm,v_num,v_type,nullif(btrim(p_destination),''),nullif(btrim(p_reference_number),''),nullif(btrim(p_notes),'')) returning id into v_id;
 return v_id;
end $$;

create or replace function public.nodara_add_ftz_disposition_line(p_disposition_id uuid,p_cargo_object_id uuid,p_quantity numeric,p_uom text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_identity uuid;v_id uuid;v_balance numeric;v_status text;
begin
 select organization_id,inventory_identity_id,status into v_org,v_identity,v_status from ftz_dispositions where id=p_disposition_id;
 if v_org is null or not nodara_is_org_member(v_org) then raise exception 'Access denied';end if;if v_status<>'DRAFT' then raise exception 'Only draft dispositions can be edited';end if;
 select coalesce(sum(quantity_delta),0) into v_balance from ftz_inventory_ledger where inventory_identity_id=v_identity and cargo_object_id=p_cargo_object_id and upper(uom)=upper(p_uom);
 if p_quantity<=0 or p_quantity>v_balance then raise exception 'Quantity exceeds available FTZ inventory (% %)',v_balance,upper(p_uom);end if;
 insert into ftz_disposition_lines(organization_id,disposition_id,cargo_object_id,quantity,uom) values(v_org,p_disposition_id,p_cargo_object_id,p_quantity,upper(p_uom)) returning id into v_id;return v_id;
end $$;

create or replace function public.nodara_post_ftz_disposition(p_disposition_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare d ftz_dispositions%rowtype;l record;v_balance numeric;v_count int:=0;v_event text;
begin
 select * into d from ftz_dispositions where id=p_disposition_id for update;
 if d.id is null or not nodara_is_org_member(d.organization_id) then raise exception 'Access denied';end if;
 if d.status<>'DRAFT' then raise exception 'Disposition is not draft';end if;
 if not exists(select 1 from ftz_disposition_lines where disposition_id=d.id) then raise exception 'Add at least one inventory line';end if;
 v_event:=case d.disposition_type when 'EXPORT' then 'EXPORT' when 'DESTRUCTION' then 'DESTRUCTION' when 'TRANSFER' then 'TRANSFER_OUT' else 'WITHDRAWAL_POST' end;
 for l in select * from ftz_disposition_lines where disposition_id=d.id loop
  select coalesce(sum(quantity_delta),0) into v_balance from ftz_inventory_ledger where inventory_identity_id=d.inventory_identity_id and cargo_object_id=l.cargo_object_id and upper(uom)=upper(l.uom);
  if l.quantity>v_balance then raise exception 'Insufficient FTZ inventory at posting';end if;
  insert into ftz_inventory_ledger(organization_id,inventory_identity_id,admission_id,cargo_object_id,event_type,quantity_delta,uom,reference_type,reference_id,reference_number,reason)
  values(d.organization_id,d.inventory_identity_id,d.admission_id,l.cargo_object_id,v_event,-l.quantity,l.uom,'DISPOSITION',d.id,d.disposition_number,d.notes);v_count:=v_count+1;
 end loop;
 update ftz_dispositions set status='POSTED',posted_at=now(),updated_at=now() where id=d.id;
 perform nodara_ftz_record_event(d.admission_id,'DISPOSITION_POSTED',replace(d.disposition_type,'_',' ')||' posted',d.disposition_number,'DISPOSITION',d.id,jsonb_build_object('lines',v_count));
 if not exists(select 1 from ftz_inventory_balance where inventory_identity_id=d.inventory_identity_id and quantity_on_hand>0) then update ftz_inventory_identities set status='CLOSED',closed_at=now() where id=d.inventory_identity_id;end if;
 return v_count;
end $$;
revoke execute on function public.nodara_create_ftz_disposition(uuid,text,text,text,text) from public,anon;grant execute on function public.nodara_create_ftz_disposition(uuid,text,text,text,text) to authenticated;
revoke execute on function public.nodara_add_ftz_disposition_line(uuid,uuid,numeric,text) from public,anon;grant execute on function public.nodara_add_ftz_disposition_line(uuid,uuid,numeric,text) to authenticated;
revoke execute on function public.nodara_post_ftz_disposition(uuid) from public,anon;grant execute on function public.nodara_post_ftz_disposition(uuid) to authenticated;