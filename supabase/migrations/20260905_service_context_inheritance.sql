alter table public.service_catalog add column if not exists operational_defaults jsonb not null default '{}'::jsonb;
alter table public.customer_rate_agreements add column if not exists is_default_service boolean not null default false;
alter table public.customer_rate_agreements add column if not exists operational_context_override jsonb not null default '{}'::jsonb;
create index if not exists customer_rate_default_service_idx on public.customer_rate_agreements(organization_id,customer_id,is_default_service,active);
comment on column public.service_catalog.operational_defaults is 'Operational context defaults inherited when this service is selected, e.g. direction/mode/customs regime.';
comment on column public.customer_rate_agreements.is_default_service is 'Preferred default service for this customer; transactions may override it.';
comment on column public.customer_rate_agreements.operational_context_override is 'Customer-specific context override layered over service_catalog.operational_defaults.';
notify pgrst,'reload schema';