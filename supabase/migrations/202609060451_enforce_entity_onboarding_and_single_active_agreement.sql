-- Every entity automatically receives a canonical onboarding profile.
create or replace function public.nodara_ensure_entity_onboarding_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.organization_id is not null then
    insert into public.entity_onboarding_profiles(organization_id,entity_id,status,metadata)
    values(new.organization_id,new.id,'NOT_STARTED',jsonb_build_object('source','ENTITY_CREATE_TRIGGER'))
    on conflict(organization_id,entity_id) do nothing;
  end if;
  return new;
end;$$;

drop trigger if exists trg_entity_onboarding_profile on public.entities;
create trigger trg_entity_onboarding_profile after insert on public.entities
for each row execute function public.nodara_ensure_entity_onboarding_profile();

-- Activating a version supersedes previous active versions for the same customer + service.
create or replace function public.nodara_single_active_service_agreement()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='ACTIVE' then
    update public.service_agreements
       set status='SUSPENDED', updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('superseded_by_version',new.agreement_version,'superseded_at',now())
     where organization_id=new.organization_id
       and customer_id=new.customer_id
       and service_id=new.service_id
       and status='ACTIVE'
       and id<>new.id;
  end if;
  return new;
end;$$;

drop trigger if exists trg_single_active_service_agreement on public.service_agreements;
create trigger trg_single_active_service_agreement before insert or update of status,service_id,customer_id on public.service_agreements
for each row execute function public.nodara_single_active_service_agreement();

create unique index if not exists service_agreements_one_active_per_service_idx
on public.service_agreements(organization_id,customer_id,service_id)
where status='ACTIVE';