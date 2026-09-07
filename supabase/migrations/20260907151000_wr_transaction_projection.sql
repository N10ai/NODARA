-- Bring Warehouse Receipts fully into canonical Party/Reference projections while preserving current job/reference compatibility.

create or replace function public.nodara_sync_wr_transaction_projection(p_wr_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare wr public.warehouse_receipts%rowtype; j public.jobs%rowtype; txid uuid; ename text;
begin
 select * into wr from public.warehouse_receipts where id=p_wr_id; if wr.id is null then return; end if;
 select * into j from public.jobs where id=wr.job_id;
 select id into txid from public.transactions where organization_id=wr.organization_id and transaction_type='WAREHOUSE_RECEIPT' and domain_record_id=wr.id;
 if txid is null then return; end if;
 delete from public.transaction_parties where transaction_id=txid and role_code='CUSTOMER' and source='DOMAIN_PROJECTION';
 if j.customer_id is not null then
   select name into ename from public.entities where id=j.customer_id and organization_id=wr.organization_id;
   if ename is not null then insert into public.transaction_parties(organization_id,transaction_id,role_code,entity_id,party_name_snapshot,is_primary,source,provenance) values(wr.organization_id,txid,'CUSTOMER',j.customer_id,ename,true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','source_table','jobs','captured_at',now())) on conflict do nothing; end if;
 end if;
end $$;

create or replace function public.nodara_sync_wr_projection_trigger() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.nodara_sync_wr_transaction_projection(new.id); return new; end $$;
drop trigger if exists trg_z_wr_transaction_projection on public.warehouse_receipts;
create trigger trg_z_wr_transaction_projection after insert or update on public.warehouse_receipts for each row execute function public.nodara_sync_wr_projection_trigger();

create or replace function public.nodara_sync_job_wr_projection_trigger() returns trigger language plpgsql security definer set search_path=public as $$ declare r record; begin for r in select id from public.warehouse_receipts where job_id=new.id loop perform public.nodara_sync_wr_transaction_projection(r.id); end loop; return new; end $$;
drop trigger if exists trg_jobs_wr_transaction_projection on public.jobs;
create trigger trg_jobs_wr_transaction_projection after update of customer_id on public.jobs for each row when (old.customer_id is distinct from new.customer_id) execute function public.nodara_sync_job_wr_projection_trigger();

create or replace function public.nodara_sync_legacy_wr_reference_trigger() returns trigger language plpgsql security definer set search_path=public as $$
declare txid uuid; orgid uuid;
begin
 if tg_op='DELETE' then
   select organization_id,id into orgid,txid from public.transactions where transaction_type='WAREHOUSE_RECEIPT' and domain_record_id=old.warehouse_receipt_id limit 1;
   if txid is not null then delete from public.transaction_references where transaction_id=txid and reference_type=upper(old.reference_type) and reference_value=old.reference_value and source in ('LEGACY_REFERENCE','DOMAIN_PROJECTION'); end if; return old;
 end if;
 select organization_id,id into orgid,txid from public.transactions where transaction_type='WAREHOUSE_RECEIPT' and domain_record_id=new.warehouse_receipt_id limit 1;
 if txid is not null and nullif(btrim(new.reference_value),'') is not null then
   if new.is_primary then update public.transaction_references set is_primary=false where transaction_id=txid and reference_type=upper(new.reference_type) and is_primary and reference_value<>btrim(new.reference_value); end if;
   insert into public.transaction_references(organization_id,transaction_id,reference_type,reference_value,is_primary,source,provenance) values(orgid,txid,upper(new.reference_type),btrim(new.reference_value),coalesce(new.is_primary,false),'LEGACY_REFERENCE',jsonb_build_object('source_type',upper(coalesce(new.source,'SYSTEM')),'source_table','shipment_references','captured_at',now())) on conflict(transaction_id,reference_type,reference_value) do update set is_primary=excluded.is_primary,provenance=excluded.provenance;
 end if; return new;
end $$;
drop trigger if exists trg_legacy_wr_reference_projection on public.shipment_references;
create trigger trg_legacy_wr_reference_projection after insert or update or delete on public.shipment_references for each row execute function public.nodara_sync_legacy_wr_reference_trigger();

do $$ declare r record; begin for r in select id from public.warehouse_receipts loop perform public.nodara_sync_wr_transaction_projection(r.id); end loop; end $$;

-- The canonical party/reference commands are redefined in the live migration to mirror WR CUSTOMER to jobs and WR typed references to shipment_references until the WR UI is migrated.
-- Keep helpers trigger-only.
revoke execute on function public.nodara_sync_wr_transaction_projection(uuid) from public,anon,authenticated;
revoke execute on function public.nodara_sync_wr_projection_trigger() from public,anon,authenticated;
revoke execute on function public.nodara_sync_job_wr_projection_trigger() from public,anon,authenticated;
revoke execute on function public.nodara_sync_legacy_wr_reference_trigger() from public,anon,authenticated;
