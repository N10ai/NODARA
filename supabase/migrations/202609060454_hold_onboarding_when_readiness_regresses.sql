create or replace function public.nodara_refresh_entity_onboarding(p_entity_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_profile uuid; v_pending integer; v_status text;
begin
  select id,status into v_profile,v_status from public.entity_onboarding_profiles where entity_id=p_entity_id limit 1;
  if v_profile is null then return; end if;

  update public.entity_onboarding_requirements
     set status=case when exists(select 1 from public.entity_contacts c where c.entity_id=p_entity_id and c.active=true) then 'SATISFIED' else 'PENDING' end,
         evidence=jsonb_build_object('derived',true,'source','entity_contacts','refreshed_at',now()),updated_at=now()
   where onboarding_profile_id=v_profile and requirement_code='PRIMARY_CONTACT';

  update public.entity_onboarding_requirements
     set status=case when exists(select 1 from public.service_agreements a where a.customer_id=p_entity_id and a.status='ACTIVE' and a.effective_from<=current_date and (a.effective_to is null or a.effective_to>=current_date)) then 'SATISFIED' else 'PENDING' end,
         evidence=jsonb_build_object('derived',true,'source','service_agreements','refreshed_at',now()),updated_at=now()
   where onboarding_profile_id=v_profile and requirement_code='SERVICE_AGREEMENT';

  update public.entity_onboarding_requirements
     set status=case when exists(select 1 from public.service_agreements a join public.service_agreement_billing_rules b on b.agreement_id=a.id and b.active=true where a.customer_id=p_entity_id and a.status='ACTIVE') then 'SATISFIED' else 'PENDING' end,
         evidence=jsonb_build_object('derived',true,'source','service_agreement_billing_rules','refreshed_at',now()),updated_at=now()
   where onboarding_profile_id=v_profile and requirement_code='BILLING_SETUP';

  select count(*) into v_pending from public.entity_onboarding_requirements
   where onboarding_profile_id=v_profile and required=true and status not in ('SATISFIED','WAIVED');
  if v_pending>0 and v_status='ACTIVE' then
    update public.entity_onboarding_profiles set status='ON_HOLD',updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('hold_reason','READINESS_REGRESSION','hold_at',now()) where id=v_profile;
  elsif v_pending>0 and v_status='READY' then
    update public.entity_onboarding_profiles set status='IN_PROGRESS',updated_at=now() where id=v_profile;
  end if;
end;$$;