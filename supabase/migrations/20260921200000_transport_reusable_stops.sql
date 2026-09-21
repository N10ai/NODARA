alter table public.transport_orders
  add column if not exists pickup_address_id uuid references public.entity_addresses(id),
  add column if not exists delivery_address_id uuid references public.entity_addresses(id),
  add column if not exists pickup_contact_id uuid references public.entity_contacts(id),
  add column if not exists delivery_contact_id uuid references public.entity_contacts(id),
  add column if not exists pickup_instructions text,
  add column if not exists delivery_instructions text,
  add column if not exists pickup_appointment_reference text,
  add column if not exists delivery_appointment_reference text;
create index if not exists idx_transport_orders_pickup_address on public.transport_orders(pickup_address_id);
create index if not exists idx_transport_orders_delivery_address on public.transport_orders(delivery_address_id);