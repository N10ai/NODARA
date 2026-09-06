create or replace function public.nodara_seed_entity_onboarding()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_profile uuid;
begin
  if new.organization_id is null then return new; end if;
  insert into public.entity_onboarding_profiles(organization_id,entity_id,status,metadata)
  values(new.organization_id,new.id,'NOT_STARTED',jsonb_build_object('source','ENTITY_TRIGGER'))
  on conflict(organization_id,entity_id) do update set updated_at=now()
  returning id into v_profile;
  if 'customer'=any(coalesce(new.roles,'{}'::text[])) then
    insert into public.entity_onboarding_requirements(organization_id,onboarding_profile_id,requirement_code,requirement_type,label,required,status,evidence)
    values
      (new.organization_id,v_profile,'PRIMARY_CONTACT','MASTER_DATA','Primary operations contact',true,'PENDING',jsonb_build_object('derived',true)),
      (new.organization_id,v_profile,'SERVICE_AGREEMENT','SERVICE_AGREEMENT','Active Service Agreement',true,'PENDING',jsonb_build_object('derived',true))
    on conflict(onboarding_profile_id,requirement_code) do nothing;
  end if;
  return new;
end;$$;

drop trigger if exists trg_entity_onboarding_profile on public.entities;
create trigger trg_entity_onboarding_profile after insert or update of roles,organization_id on public.entities
for each row execute function public.nodara_seed_entity_onboarding();

insert into public.entity_onboarding_requirements(organization_id,onboarding_profile_id,requirement_code,requirement_type,label,required,status,evidence)
select p.organization_id,p.id,x.code,x.kind,x.label,true,'PENDING',jsonb_build_object('derived',true)
from public.entity_onboarding_profiles p
join public.entities e on e.id=p.entity_id
cross join (values
 ('PRIMARY_CONTACT','MASTER_DATA','Primary operations contact'),
 ('SERVICE_AGREEMENT','SERVICE_AGREEMENT','Active Service Agreement')
) as x(code,kind,label)
where 'customer'=any(coalesce(e.roles,'{}'::text[]))
on conflict(onboarding_profile_id,requirement_code) do nothing;

create or replace function public.nodara_gate_entity_onboarding_activation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_pending integer;
begin
  if new.status='ACTIVE' and old.status is distinct from 'ACTIVE' then
    select count(*) into v_pending
      from public.entity_onboarding_requirements r
     where r.onboarding_profile_id=new.id
       and r.required=true
       and r.status not in ('SATISFIED','WAIVED');
    if v_pending>0 then
      raise exception 'Cannot activate entity onboarding: % required requirement(s) are still pending.',v_pending;
    end if;
    new.activated_at=coalesce(new.activated_at,now());
  end if;
  return new;
end;$$;

drop trigger if exists trg_gate_entity_onboarding_activation on public.entity_onboarding_profiles;
create trigger trg_gate_entity_onboarding_activation before update of status on public.entity_onboarding_profiles
for each row execute function public.nodara_gate_entity_onboarding_activation();