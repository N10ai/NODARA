-- Independent deletion lifecycle for FTZ Admissions.
create or replace function public.nodara_delete_ftz_admission(p_admission_id uuid,p_confirmation text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_number text;
begin
 select organization_id,admission_number into v_org,v_number from public.ftz_admissions where id=p_admission_id;
 if v_org is null then raise exception 'FTZ admission not found'; end if;
 if not public.nodara_is_org_member(v_org) then raise exception 'Workspace access denied'; end if;
 if coalesce(btrim(p_confirmation),'')<>v_number then raise exception 'Confirmation does not match Admission number'; end if;
 if exists(select 1 from public.ftz_inventory_identity_cargo c join public.ftz_inventory_identities i on i.id=c.inventory_identity_id where i.admission_id=p_admission_id) then
   raise exception 'Admission has posted FTZ inventory. Reverse/dispose the inventory before deleting the Admission.';
 end if;
 -- WRs intentionally survive. The junction rows disappear with the Admission.
 delete from public.ftz_admissions where id=p_admission_id;
 return true;
end $$;
revoke execute on function public.nodara_delete_ftz_admission(uuid,text) from public,anon;
grant execute on function public.nodara_delete_ftz_admission(uuid,text) to authenticated;

create or replace function public.nodara_delete_ftz_admissions(p_admission_ids uuid[],p_confirmations jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_n int:=0; v_number text;
begin
 foreach v_id in array p_admission_ids loop
   select admission_number into v_number from public.ftz_admissions where id=v_id;
   if v_number is null then continue; end if;
   perform public.nodara_delete_ftz_admission(v_id,coalesce(p_confirmations->>v_id::text,''));
   v_n:=v_n+1;
 end loop;
 return v_n;
end $$;
revoke execute on function public.nodara_delete_ftz_admissions(uuid[],jsonb) from public,anon;
grant execute on function public.nodara_delete_ftz_admissions(uuid[],jsonb) to authenticated;