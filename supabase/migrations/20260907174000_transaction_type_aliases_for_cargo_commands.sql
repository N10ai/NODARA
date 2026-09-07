create or replace function public.nodara_transaction_org(p_transaction_type text,p_transaction_id uuid)
returns uuid language plpgsql stable security definer set search_path='public' as $$
declare o uuid; t text:=upper(trim(p_transaction_type));
begin
 case t
  when 'SHIPMENT' then select organization_id into o from public.shipments where id=p_transaction_id;
  when 'TRANSPORT_ORDER' then select organization_id into o from public.transport_orders where id=p_transaction_id;
  when 'TRANSPORT' then select organization_id into o from public.transport_orders where id=p_transaction_id;
  when 'TO' then select organization_id into o from public.transport_orders where id=p_transaction_id;
  when 'WAREHOUSE_RECEIPT' then select organization_id into o from public.warehouse_receipts where id=p_transaction_id;
  when 'WR' then select organization_id into o from public.warehouse_receipts where id=p_transaction_id;
  when 'CARGO_RELEASE' then select organization_id into o from public.cargo_releases where id=p_transaction_id;
  when 'CR' then select organization_id into o from public.cargo_releases where id=p_transaction_id;
  else raise exception 'Unsupported transaction type %',p_transaction_type;
 end case;
 if o is null then raise exception 'Transaction not found'; end if;
 return o;
end $$;
revoke all on function public.nodara_transaction_org(text,uuid) from public,anon,authenticated;
