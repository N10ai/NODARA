create or replace function public.nodara_create_ftz_document(
 p_admission_id uuid,p_storage_path text,p_file_name text,p_mime_type text default null,
 p_category text default 'OTHER',p_display_name text default null,p_document_number text default null,p_is_key_document boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_doc uuid;v_cat text;
begin
 select organization_id into v_org from ftz_admissions where id=p_admission_id;
 if v_org is null or not nodara_is_org_member(v_org) then raise exception 'Workspace access denied';end if;
 v_cat:=upper(coalesce(nullif(btrim(p_category),''),'OTHER'));
 insert into documents(organization_id,document_type,storage_path,file_name,mime_type,category,source,status,display_name,document_number,is_current,metadata)
 values(v_org,v_cat,p_storage_path,p_file_name,p_mime_type,v_cat,'FTZ_ADMISSION','ACTIVE',coalesce(nullif(btrim(p_display_name),''),p_file_name),nullif(btrim(p_document_number),''),true,jsonb_build_object('ftz_admission_id',p_admission_id))
 returning id into v_doc;
 insert into ftz_document_links(organization_id,admission_id,document_id,category,record_type,record_id,document_date,is_key_document)
 values(v_org,p_admission_id,v_doc,v_cat,'ADMISSION',p_admission_id,now(),coalesce(p_is_key_document,false));
 perform nodara_ftz_record_event(p_admission_id,'DOCUMENT_ADDED','Document added',coalesce(p_display_name,p_file_name),'DOCUMENT',v_doc,jsonb_build_object('category',v_cat));
 return v_doc;
end $$;
revoke execute on function public.nodara_create_ftz_document(uuid,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.nodara_create_ftz_document(uuid,text,text,text,text,text,text,boolean) to authenticated;

create or replace function public.nodara_update_ftz_document(p_admission_id uuid,p_document_id uuid,p_display_name text,p_category text,p_document_number text default null,p_is_key_document boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_cat text;
begin
 select organization_id into v_org from ftz_admissions where id=p_admission_id;
 if v_org is null or not nodara_is_org_member(v_org) then raise exception 'Workspace access denied';end if;
 if not exists(select 1 from ftz_document_links where admission_id=p_admission_id and document_id=p_document_id) then raise exception 'Document is not linked to this Admission';end if;
 v_cat:=upper(coalesce(nullif(btrim(p_category),''),'OTHER'));
 update documents set display_name=coalesce(nullif(btrim(p_display_name),''),file_name),category=v_cat,document_type=v_cat,document_number=nullif(btrim(p_document_number),''),updated_at=now() where id=p_document_id and organization_id=v_org;
 update ftz_document_links set category=v_cat,is_key_document=coalesce(p_is_key_document,false) where admission_id=p_admission_id and document_id=p_document_id;
 perform nodara_ftz_record_event(p_admission_id,'DOCUMENT_UPDATED','Document updated',coalesce(p_display_name,'Document'),'DOCUMENT',p_document_id,jsonb_build_object('category',v_cat));
 return true;
end $$;
revoke execute on function public.nodara_update_ftz_document(uuid,uuid,text,text,text,boolean) from public,anon;
grant execute on function public.nodara_update_ftz_document(uuid,uuid,text,text,text,boolean) to authenticated;