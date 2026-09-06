create or replace function public.nodara_refresh_entity_onboarding(p_entity_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_profile uuid;
begin
  select id into v_profile from public.entity_onboarding_profiles where entity_id=p_entity_id limit 1;
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
end;$$;

create or replace function public.nodara_refresh_onboarding_from_contact()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.nodara_refresh_entity_onboarding(coalesce(new.entity_id,old.entity_id));return coalesce(new,old);
end;$$;
drop trigger if exists trg_refresh_onboarding_contact on public.entity_contacts;
create trigger trg_refresh_onboarding_contact after insert or update or delete on public.entity_contacts
for each row execute function public.nodara_refresh_onboarding_from_contact();

create or replace function public.nodara_refresh_onboarding_from_agreement()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.nodara_refresh_entity_onboarding(coalesce(new.customer_id,old.customer_id));return coalesce(new,old);
end;$$;
drop trigger if exists trg_refresh_onboarding_agreement on public.service_agreements;
create trigger trg_refresh_onboarding_agreement after insert or update or delete on public.service_agreements
for each row execute function public.nodara_refresh_onboarding_from_agreement();

create or replace function public.nodara_refresh_onboarding_from_billing()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_customer uuid;
begin
  select customer_id into v_customer from public.service_agreements where id=coalesce(new.agreement_id,old.agreement_id);
  if v_customer is not null then perform public.nodara_refresh_entity_onboarding(v_customer); end if;return coalesce(new,old);
end;$$;
drop trigger if exists trg_refresh_onboarding_billing on public.service_agreement_billing_rules;
create trigger trg_refresh_onboarding_billing after insert or update or delete on public.service_agreement_billing_rules
for each row execute function public.nodara_refresh_onboarding_from_billing();

do $$ declare r record; begin for r in select id from public.entities loop perform public.nodara_refresh_entity_onboarding(r.id); end loop; end $$;