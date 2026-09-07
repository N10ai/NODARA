-- Canonical document/version/signature commands.

create or replace function public.nodara_register_document(p_transaction_id uuid,p_document_type text,p_storage_path text,p_file_name text,p_mime_type text default null,p_cargo_object_id uuid default null,p_entity_id uuid default null,p_template_id uuid default null,p_display_name text default null,p_document_number text default null,p_category text default null,p_link_role text default 'SUPPORTING',p_source text default 'USER',p_status text default 'ACTIVE',p_notes text default null,p_metadata jsonb default '{}'::jsonb,p_provenance jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare tx public.transactions%rowtype; did uuid; orgcheck uuid;
begin
 select * into tx from public.transactions where id=p_transaction_id; if tx.id is null then raise exception 'Transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if;
 if nullif(btrim(p_storage_path),'') is null or nullif(btrim(p_file_name),'') is null then raise exception 'Storage path and file name are required'; end if;
 if p_cargo_object_id is not null then select organization_id into orgcheck from public.cargo_objects where id=p_cargo_object_id; if orgcheck is null or orgcheck<>tx.organization_id then raise exception 'Cargo object not found in workspace'; end if; end if;
 if p_entity_id is not null then select organization_id into orgcheck from public.entities where id=p_entity_id; if orgcheck is null or orgcheck<>tx.organization_id then raise exception 'Entity not found in workspace'; end if; end if;
 if p_template_id is not null then select organization_id into orgcheck from public.document_templates_v2 where id=p_template_id; if orgcheck is null or orgcheck<>tx.organization_id then raise exception 'Template not found in workspace'; end if; end if;
 insert into public.documents(organization_id,transaction_id,cargo_object_id,entity_id,template_id,document_type,storage_path,file_name,mime_type,display_name,document_number,category,source,status,notes,metadata,provenance,created_by,created_at,updated_at,version_no,is_current)
 values(tx.organization_id,tx.id,p_cargo_object_id,p_entity_id,p_template_id,upper(p_document_type),btrim(p_storage_path),btrim(p_file_name),p_mime_type,coalesce(nullif(btrim(p_display_name),''),btrim(p_file_name)),nullif(btrim(p_document_number),''),p_category,upper(coalesce(p_source,'USER')),upper(coalesce(p_status,'ACTIVE')),p_notes,coalesce(p_metadata,'{}'::jsonb),coalesce(p_provenance,'{}'::jsonb),auth.uid(),now(),now(),1,true) returning id into did;
 insert into public.document_links(organization_id,document_id,transaction_id,cargo_object_id,entity_id,link_role,is_primary,provenance) values(tx.organization_id,did,tx.id,p_cargo_object_id,p_entity_id,upper(coalesce(p_link_role,'SUPPORTING')),true,coalesce(p_provenance,'{}'::jsonb));
 perform public.nodara_record_activity(tx.id,'DOCUMENT_ADDED','DOCUMENT',coalesce(nullif(btrim(p_display_name),''),btrim(p_file_name)),jsonb_build_object('document_id',did,'document_type',upper(p_document_type),'file_name',btrim(p_file_name),'link_role',upper(coalesce(p_link_role,'SUPPORTING'))),coalesce(p_provenance,'{}'::jsonb),null); return did;
end $$;

create or replace function public.nodara_create_document_version(p_document_id uuid,p_storage_path text,p_file_name text,p_mime_type text default null,p_notes text default null,p_metadata jsonb default '{}'::jsonb,p_provenance jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare old public.documents%rowtype; did uuid;
begin
 select * into old from public.documents where id=p_document_id; if old.id is null then raise exception 'Document not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(old.organization_id) then raise exception 'Workspace access denied'; end if;
 update public.documents set is_current=false,updated_at=now() where id=old.id;
 insert into public.documents(organization_id,transaction_id,cargo_object_id,entity_id,template_id,document_type,storage_path,file_name,mime_type,display_name,document_number,category,source,status,notes,metadata,provenance,created_by,created_at,updated_at,version_no,is_current,supersedes_document_id)
 values(old.organization_id,old.transaction_id,old.cargo_object_id,old.entity_id,old.template_id,old.document_type,btrim(p_storage_path),btrim(p_file_name),coalesce(p_mime_type,old.mime_type),old.display_name,old.document_number,old.category,old.source,old.status,coalesce(p_notes,old.notes),coalesce(old.metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),coalesce(p_provenance,'{}'::jsonb),auth.uid(),now(),now(),old.version_no+1,true,old.id) returning id into did;
 insert into public.document_links(organization_id,document_id,transaction_id,cargo_object_id,entity_id,link_role,is_primary,provenance,metadata)
 select organization_id,did,transaction_id,cargo_object_id,entity_id,link_role,is_primary,coalesce(p_provenance,'{}'::jsonb),metadata from public.document_links where document_id=old.id;
 if old.transaction_id is not null then perform public.nodara_record_activity(old.transaction_id,'DOCUMENT_VERSION_CREATED','DOCUMENT',coalesce(old.display_name,old.file_name),jsonb_build_object('document_id',did,'supersedes_document_id',old.id,'version_no',old.version_no+1),coalesce(p_provenance,'{}'::jsonb),null); end if; return did;
end $$;

create or replace function public.nodara_create_signature_request(p_transaction_id uuid,p_document_id uuid default null,p_template_id uuid default null,p_entity_id uuid default null,p_signers jsonb default '[]'::jsonb,p_field_values jsonb default '{}'::jsonb,p_provider text default null,p_provenance jsonb default '{}'::jsonb,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare tx public.transactions%rowtype; orgcheck uuid; rid uuid;
begin
 select * into tx from public.transactions where id=p_transaction_id; if tx.id is null then raise exception 'Transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if;
 if p_document_id is not null then select organization_id into orgcheck from public.documents where id=p_document_id; if orgcheck is null or orgcheck<>tx.organization_id then raise exception 'Document not found in workspace'; end if; end if;
 if p_template_id is not null then select organization_id into orgcheck from public.document_templates_v2 where id=p_template_id; if orgcheck is null or orgcheck<>tx.organization_id then raise exception 'Template not found in workspace'; end if; end if;
 if p_entity_id is not null then select organization_id into orgcheck from public.entities where id=p_entity_id; if orgcheck is null or orgcheck<>tx.organization_id then raise exception 'Entity not found in workspace'; end if; end if;
 insert into public.signature_requests(organization_id,transaction_id,template_id,document_id,entity_id,target_type,target_id,status,signers,field_values,external_provider,metadata,provenance,created_at,updated_at)
 values(tx.organization_id,tx.id,p_template_id,p_document_id,p_entity_id,tx.transaction_type,tx.domain_record_id,'DRAFT',coalesce(p_signers,'[]'::jsonb),coalesce(p_field_values,'{}'::jsonb),p_provider,coalesce(p_metadata,'{}'::jsonb),coalesce(p_provenance,'{}'::jsonb),now(),now()) returning id into rid;
 perform public.nodara_record_activity(tx.id,'SIGNATURE_REQUEST_CREATED','DOCUMENT','Signature request',jsonb_build_object('signature_request_id',rid,'document_id',p_document_id,'template_id',p_template_id,'entity_id',p_entity_id),coalesce(p_provenance,'{}'::jsonb),null); return rid;
end $$;
